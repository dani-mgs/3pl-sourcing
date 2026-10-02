import { createHash } from "node:crypto";
import { z } from "zod";

// Turns one chapter of USITC's exportList JSON into hts_lines rows. The feed
// is external data, so every row is validated; a chapter with any malformed
// row is rejected whole rather than stored partly.

export const HTS_API_BASE = "https://hts.usitc.gov/reststop";

export const HTS_CHAPTERS: readonly string[] = Array.from({ length: 99 }, (_, i) =>
  String(i + 1).padStart(2, "0"),
);
// Reserved in the HTS; the export is always empty.
export const EMPTY_CHAPTERS: readonly string[] = ["77"];

// "0100" … "9999": the export takes a from/to range of headings.
export function chapterExportUrl(chapter: string): string {
  const next = chapter === "99" ? "9999" : `${String(Number(chapter) + 1).padStart(2, "0")}00`;
  const params = new URLSearchParams({ from: `${chapter}00`, to: next, format: "JSON", styles: "false" });
  return `${HTS_API_BASE}/exportList?${params}`;
}

const text = z.string().nullish().transform((v) => v ?? "");

const footnoteSchema = z.object({
  columns: z.array(z.string()).nullish(),
  value: z.string().nullish(),
  type: z.string().nullish(),
});

const rawRowSchema = z.object({
  htsno: text,
  indent: z.union([z.string(), z.number()]).transform((v, ctx) => {
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0 || n > 20) {
      ctx.addIssue({ code: "custom", message: "bad indent" });
      return z.NEVER;
    }
    return n;
  }),
  description: text,
  units: z.array(z.string()).nullish(),
  general: text,
  special: text,
  other: text,
  footnotes: z.array(footnoteSchema).nullish(),
});

export const chapterExportSchema = z.array(rawRowSchema);

export const currentReleaseSchema = z.object({
  name: z.string().regex(/^[0-9A-Za-z]{4,40}$/),
  description: z.string().nullish(),
  title: z.string().nullish(),
});

export const releaseListSchema = z.array(
  z.object({
    name: z.string(),
    releaseStartDate: z.string().nullish(),
  }),
);

export type HtsLineRow = {
  hts_code: string;
  chapter: string;
  indent: number;
  description: string;
  ancestor_descriptions: string[];
  units: string[];
  general_rate: string | null;
  special_rate: string | null;
  other_rate: string | null;
  rate_from_code: string | null;
  footnotes: { columns: string[]; value: string; type: string | null }[];
};

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&nbsp;": " ",
};

// USITC descriptions carry a little HTML (<i>, <u>, <sup>). Stored as plain
// text; the app renders text only.
export function plainText(value: string): string {
  return value
    .replace(/<[^>]*>/g, "")
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (entity) => ENTITIES[entity] ?? entity)
    .replace(/\s+/g, " ")
    .trim();
}

function blankToNull(value: string): string | null {
  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed === "" ? null : trimmed;
}

type Ancestor = {
  indent: number;
  description: string;
  general: string | null;
  special: string | null;
  other: string | null;
  rateFrom: string | null;
};

export type BuildResult = { ok: true; lines: HtsLineRow[] } | { ok: false; error: string };

// Rates in the HTS sit on the 8-digit line (or on a 10-digit line with no
// 8-digit parent); statistical lines under it are blank and take its rate.
// The three rate columns travel together: a line with its own general or
// column 2 rate uses all three of its own columns.
export function buildHtsLines(chapter: string, body: unknown): BuildResult {
  const parsed = chapterExportSchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, error: `Chapter ${chapter}: the export didn't match the expected format.` };
  }

  const lines: HtsLineRow[] = [];
  const seen = new Set<string>();
  const stack: Ancestor[] = [];

  for (const row of parsed.data) {
    while (stack.length > 0 && stack[stack.length - 1].indent >= row.indent) stack.pop();
    const parent = stack[stack.length - 1];

    const digits = row.htsno.replace(/\./g, "").trim();
    const description = plainText(row.description);
    const ownGeneral = blankToNull(row.general);
    const ownOther = blankToNull(row.other);
    const hasOwnRate = ownGeneral != null || ownOther != null;

    const node: Ancestor = {
      indent: row.indent,
      description,
      general: hasOwnRate ? ownGeneral : (parent?.general ?? null),
      special: hasOwnRate ? blankToNull(row.special) : (parent?.special ?? null),
      other: hasOwnRate ? ownOther : (parent?.other ?? null),
      rateFrom: hasOwnRate ? digits || null : (parent?.rateFrom ?? null),
    };

    if (digits !== "") {
      if (!/^[0-9]{4,10}$/.test(digits) || !digits.startsWith(chapter)) {
        return { ok: false, error: `Chapter ${chapter}: unexpected HTS number in the export.` };
      }
      if (seen.has(digits)) {
        return { ok: false, error: `Chapter ${chapter}: duplicate HTS number in the export.` };
      }
      seen.add(digits);
      lines.push({
        hts_code: digits,
        chapter,
        indent: row.indent,
        description,
        ancestor_descriptions: stack.map((a) => a.description).filter(Boolean),
        units: (row.units ?? []).map((u) => u.trim()).filter(Boolean),
        general_rate: node.general,
        special_rate: node.special,
        other_rate: node.other,
        rate_from_code: node.rateFrom,
        footnotes: (row.footnotes ?? [])
          .filter((f) => f.value && f.value.trim() !== "")
          .map((f) => ({
            columns: f.columns ?? [],
            value: plainText(f.value ?? ""),
            type: f.type ?? null,
          })),
      });
    }

    stack.push(node);
  }

  return { ok: true, lines };
}

// Fingerprint of chapter 99 (the additional-duty headings), stored per
// release so a later step can flag when those headings changed.
export function chapter99Digest(lines: HtsLineRow[]): string {
  const hash = createHash("sha256");
  for (const line of lines) {
    hash.update(`${line.hts_code}\u0000${line.description}\u0000${line.general_rate ?? ""}\n`);
  }
  return hash.digest("hex");
}

export type ChapterCounts = Record<string, number>;

// Below this many lines in all, an import can't be the whole HTS (the 2026
// schedule has about 30,000 numbered lines).
export const MIN_TOTAL_LINES = 25_000;
// A new release may lose at most 10% of lines overall, and half of any
// chapter with 100+ lines, compared with the current release; bigger drops
// look like a truncated export rather than a real revision.
export const MAX_TOTAL_DROP = 0.1;
export const MAX_CHAPTER_DROP = 0.5;

export function checkImportSanity(
  counts: ChapterCounts,
  current: ChapterCounts | null,
): { ok: true } | { ok: false; error: string } {
  for (const chapter of HTS_CHAPTERS) {
    if (EMPTY_CHAPTERS.includes(chapter)) continue;
    if (!counts[chapter]) return { ok: false, error: `Chapter ${chapter} has no lines.` };
  }
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
  if (total < MIN_TOTAL_LINES) {
    return { ok: false, error: `Only ${total} lines in all; expected at least ${MIN_TOTAL_LINES}.` };
  }
  if (current) {
    const currentTotal = Object.values(current).reduce((sum, n) => sum + n, 0);
    if (total < currentTotal * (1 - MAX_TOTAL_DROP)) {
      return { ok: false, error: `${total} lines, down from ${currentTotal} in the current release.` };
    }
    for (const [chapter, before] of Object.entries(current)) {
      if (before >= 100 && (counts[chapter] ?? 0) < before * (1 - MAX_CHAPTER_DROP)) {
        return {
          ok: false,
          error: `Chapter ${chapter} has ${counts[chapter] ?? 0} lines, down from ${before}.`,
        };
      }
    }
  }
  return { ok: true };
}

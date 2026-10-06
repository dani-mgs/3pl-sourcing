import { z } from "zod";
import { countryName } from "./countries";
import { formatHtsCode } from "./hts-code";
import { parseRateText } from "./rate-text";

// HTS code lookup: finds candidate lines in the current HTS release by
// keyword or code, for experts to check against the schedule. It never
// classifies a product or suggests a code: results come in code order, with
// the full path of each line so "Other" reads as the article it is.
// The search itself is search_hts_lines() (migration 20261005133647).

// Shown in the lookup popup, word for word.
export const LOOKUP_GUARDRAIL =
  "Search helps you find candidate lines. Classification depends on the General Rules of Interpretation and section/chapter notes, and is the importer's responsibility. Confirm with your customs broker.";

export const MAX_QUERY_LENGTH = 100;
export const MAX_TERMS = 8;
const MAX_TERM_LENGTH = 40;
// Lines shown per search before "refine your search".
export const RESULT_LIMIT = 150;
// A heading opened in browse mode shows every line under it, up to this.
export const BROWSE_LIMIT = 500;

export type LookupQuery =
  | { kind: "empty" }
  | { kind: "code"; digits: string }
  | { kind: "keywords"; terms: string[] }
  | { kind: "invalid"; error: string };

const querySchema = z
  .string()
  .max(MAX_QUERY_LENGTH, `Keep the search under ${MAX_QUERY_LENGTH} characters.`);

// "6402", "6402.99", "6402 99 31" → a code; anything else → keywords, each
// lowercased letters and digits only (accents dropped), so nothing typed can
// reach the database as query syntax.
export function parseLookupQuery(raw: unknown): LookupQuery {
  const parsed = querySchema.safeParse(typeof raw === "string" ? raw : "");
  if (!parsed.success) return { kind: "invalid", error: parsed.error.issues[0].message };
  const text = parsed.data.trim();
  if (text === "") return { kind: "empty" };

  if (/^[0-9.\s-]+$/.test(text)) {
    const digits = text.replace(/[.\s-]/g, "");
    if (digits.length < 2 || digits.length > 10) {
      return { kind: "invalid", error: "Enter 2 to 10 digits of an HTS code, e.g. 6402 or 6402.99." };
    }
    return { kind: "code", digits };
  }

  const terms = [
    ...new Set(
      text
        .normalize("NFKD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter(Boolean),
    ),
  ];
  if (terms.length === 0) return { kind: "invalid", error: "Enter words or an HTS code to search for." };
  if (terms.length > MAX_TERMS) return { kind: "invalid", error: `Use up to ${MAX_TERMS} words.` };
  if (terms.some((t) => t.length > MAX_TERM_LENGTH)) {
    return { kind: "invalid", error: `Words can be up to ${MAX_TERM_LENGTH} characters.` };
  }
  return { kind: "keywords", terms };
}

// ---- Result rows -------------------------------------------------------------------

export type MayApply = { key: string; name: string; origins: string[] | null };

export type LookupLine = {
  hts_code: string;
  indent: number;
  description: string;
  ancestor_descriptions: string[];
  units: string[];
  general_rate: string | null;
  rate_from_code: string | null;
  has_children: boolean;
  parents: { code: string; description: string }[];
  may_apply: MayApply[];
  total_count: number;
};

const lineSchema = z.object({
  hts_code: z.string().regex(/^[0-9]{4,10}$/),
  indent: z.number(),
  description: z.string(),
  ancestor_descriptions: z.array(z.string()).nullable().transform((v) => v ?? []),
  units: z.array(z.string()).nullable().transform((v) => v ?? []),
  general_rate: z.string().nullable(),
  rate_from_code: z.string().nullable(),
  has_children: z.boolean(),
  parents: z.array(z.object({ code: z.string(), description: z.string() })),
  may_apply: z.array(z.object({ key: z.string(), name: z.string(), origins: z.array(z.string()).nullable() })),
  total_count: z.union([z.number(), z.string()]).transform(Number),
});

export function parseLookupRows(rows: unknown): LookupLine[] {
  return z.array(lineSchema).parse(rows ?? []);
}

// ---- Path ----------------------------------------------------------------------------

export type PathStep = { code: string | null; description: string };

// Chapter → heading → subheading → … → the line. The ancestor descriptions
// include lines without a number ("Other:", "For women"); those numbered
// (parents) get their code. Matching is in order, outermost first.
export function buildPath(line: Pick<LookupLine, "hts_code" | "description" | "ancestor_descriptions" | "parents">): PathStep[] {
  const parents = [...line.parents].sort((a, b) => a.code.length - b.code.length);
  let next = 0;
  const steps: PathStep[] = [{ code: line.hts_code.slice(0, 2), description: `Chapter ${line.hts_code.slice(0, 2)}` }];
  for (const description of line.ancestor_descriptions) {
    const parent = parents[next];
    if (parent && parent.description === description) {
      steps.push({ code: parent.code, description });
      next += 1;
    } else {
      steps.push({ code: null, description });
    }
  }
  steps.push({ code: line.hts_code, description: line.description });
  return steps;
}

// "Other:" → "Other" for display in a path.
export function stepText(description: string): string {
  return description.replace(/:\s*$/, "");
}

// ---- Browse ------------------------------------------------------------------------

export type BrowseNode = {
  // Unique within the tree; numbered lines use their code.
  id: string;
  code: string | null;
  description: string;
  line: LookupLine | null;
  children: BrowseNode[];
};

// The lines under a heading as an indented tree. Rows without a number
// aren't stored, so they're rebuilt from each line's ancestor descriptions:
// lines come in code order (document order), so a line's ancestor at each
// level is its parent's last child when the descriptions match, and a new
// unnumbered row otherwise.
export function buildBrowseTree(lines: LookupLine[]): BrowseNode[] {
  const roots: BrowseNode[] = [];
  let groups = 0;
  for (const line of [...lines].sort((a, b) => a.hts_code.localeCompare(b.hts_code))) {
    let siblings = roots;
    for (const description of line.ancestor_descriptions) {
      const last = siblings.at(-1);
      if (last && last.description === description) {
        siblings = last.children;
      } else {
        groups += 1;
        const group: BrowseNode = { id: `group-${groups}`, code: null, description, line: null, children: [] };
        siblings.push(group);
        siblings = group.children;
      }
    }
    siblings.push({ id: line.hts_code, code: line.hts_code, description: line.description, line, children: [] });
  }
  return roots;
}

// Results grouped by heading (first four digits), in code order.
export function groupByHeading(lines: LookupLine[]): { heading: string; description: string | null; lines: LookupLine[] }[] {
  const groups = new Map<string, LookupLine[]>();
  for (const line of [...lines].sort((a, b) => a.hts_code.localeCompare(b.hts_code))) {
    const heading = line.hts_code.slice(0, 4);
    groups.set(heading, [...(groups.get(heading) ?? []), line]);
  }
  return [...groups.entries()].map(([heading, group]) => ({
    heading,
    description:
      group.find((l) => l.hts_code === heading)?.description ??
      group[0].parents.find((p) => p.code === heading)?.description ??
      null,
    lines: group,
  }));
}

// ---- Display ---------------------------------------------------------------------

// Whether the Tariff Calculator takes this line: an 8- or 10-digit code with
// nothing under it, outside chapters 98 and 99 (same rule as normalizeHtsCode
// and the 8-digit "several lines" check).
export function canUseInCalculator(line: Pick<LookupLine, "hts_code" | "has_children">): boolean {
  const chapter = line.hts_code.slice(0, 2);
  return (
    (line.hts_code.length === 8 || line.hts_code.length === 10) &&
    !line.has_children &&
    chapter !== "98" &&
    chapter !== "99"
  );
}

// "Section 301 (China) may apply · if from China". Origins are named only
// when there are a few; a long list says nothing useful in a badge.
export function mayApplyLabel(program: MayApply): string {
  const origins = program.origins ?? [];
  if (origins.length === 0 || origins.length > 3) return `${program.name} may apply`;
  const names = origins.map(countryName);
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} or ${names.at(-1)}`;
  return `${program.name} may apply · if from ${list}`;
}

// The general rate as published, and whether the calculator can work it out
// (same parser as the calculator). Null when the line has no rate (a heading
// or subheading whose rates sit on the lines below).
export function generalRateDisplay(
  line: Pick<LookupLine, "hts_code" | "general_rate" | "rate_from_code">,
): { text: string; calculable: boolean; fromCode: string | null } | null {
  if (line.general_rate == null) return null;
  const parsed = parseRateText(line.general_rate);
  return {
    text: parsed.kind === "free" ? "Free" : line.general_rate,
    calculable: parsed.kind !== "unsupported",
    fromCode: line.rate_from_code && line.rate_from_code !== line.hts_code ? formatHtsCode(line.rate_from_code) : null,
  };
}

// "2026HTSRev20" → "2026 Rev. 20"; "2026HTSBasic" → "2026 Basic edition".
export function releaseLabel(release: { name: string; title: string | null }): string {
  const rev = /^(\d{4})HTSRev(\d+)$/.exec(release.name);
  if (rev) return `${rev[1]} Rev. ${rev[2]}`;
  const basic = /^(\d{4})HTSBasic$/.exec(release.name);
  if (basic) return `${basic[1]} Basic edition`;
  return release.title ?? release.name;
}

// ---- Links ---------------------------------------------------------------------------

// CBP's CROSS rulings search for a heading (opens in a browser).
export function crossRulingsUrl(heading: string): string {
  return `https://rulings.cbp.gov/search?term=${encodeURIComponent(formatHtsCode(heading))}`;
}

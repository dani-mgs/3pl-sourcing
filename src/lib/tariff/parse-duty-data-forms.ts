import { z } from "zod";
import { isRealIsoDate } from "@/lib/forwarder/parse-quote-form";
import { isOriginCountry } from "./countries";

// Validates the duty-data editor forms (tariff editors and admins). Every
// message is safe to show; raw Zod issues are only logged server-side.

export type ParseResult<T> = { ok: true; data: T } | { ok: false; error: string };

const INVALID = "Something went wrong with that request. Reload the page and try again.";

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

const isoDate = (label: string) =>
  z.string().refine(isRealIsoDate, `Enter ${label} as a date.`);
const optionalText = (max: number, label: string) =>
  z.string().max(max, `${label} must be ${max} characters or fewer.`).transform((v) => v || null);
const httpsUrl = z.string().regex(/^https:\/\/\S+$/, "The source link must start with https://.").max(2000);
// An optional second source link (e.g. a PDF that's only a download) and the
// label saying what it is; both or neither.
const documentUrl = z
  .union([z.literal(""), z.string().regex(/^https:\/\/\S+$/, "The document link must start with https://.").max(2000)])
  .transform((v) => v || null);
const documentLabel = optionalText(300, "The document link's label");
const DOCUMENT_PAIR = "Give the document link and its label (e.g. \"Download Chapter 99 PDF (14 MB) — see page 685\"), or neither.";
const heading = (label: string) =>
  z.string().regex(/^9903\.\d{2}\.\d{2}$/, `${label} must look like 9903.05.84.`);

export const LEGAL_STATUSES = ["in_force", "in_force_under_litigation", "enjoined", "expired"] as const;
export const RATE_TYPES = ["add", "minimum_total", "exempt", "unconfirmed"] as const;

function run<S extends z.ZodType>(schema: S, raw: unknown, label: string): ParseResult<z.infer<S>> {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    console.error(`${label} validation failed:`, parsed.error.issues);
    return { ok: false, error: parsed.error.issues[0]?.message ?? INVALID };
  }
  return { ok: true, data: parsed.data };
}

const programKey = z.string().regex(/^[a-z0-9_]+$/, INVALID);
const uuid = z.uuid({ error: INVALID });

export function parseMarkReviewed(formData: FormData) {
  return run(
    z.object({ programKey, note: optionalText(1000, "The note") }),
    { programKey: field(formData, "program_key"), note: field(formData, "note") },
    "markReviewed",
  );
}

export function parseEndDate(formData: FormData) {
  return run(
    z.object({ id: uuid, effectiveTo: isoDate("the last day it applies") }),
    { id: field(formData, "id"), effectiveTo: field(formData, "effective_to") },
    "endDate",
  );
}

// Edits that don't change what a row charges: label, legal status, source,
// notes and, for a row with a condition, whether the condition is treated as
// met (a deliberate choice of direction). Any of these puts the program back
// to pending review, except an edit of the source alone (label, links,
// checked date).
export function parseDutyDetails(formData: FormData) {
  const hasCondition = field(formData, "has_condition") === "1";
  return run(
    z.object({
      id: uuid,
      label: z.string().min(1, "Enter a label.").max(200, "Keep the label under 200 characters."),
      legalStatus: z.enum(LEGAL_STATUSES, { error: "Choose a legal status." }),
      notes: optionalText(2000, "Notes"),
      sourceLabel: z.string().min(1, "Enter the source.").max(500, "Keep the source under 500 characters."),
      sourceUrl: httpsUrl,
      sourceCheckedOn: isoDate("the date the source was checked"),
      sourceDocumentUrl: documentUrl,
      sourceDocumentLabel: documentLabel,
      assumeCondition: z.boolean().optional(),
    }).refine((d) => (d.sourceDocumentUrl == null) === (d.sourceDocumentLabel == null), DOCUMENT_PAIR),
    {
      id: field(formData, "id"),
      label: field(formData, "label"),
      legalStatus: field(formData, "legal_status"),
      notes: field(formData, "notes"),
      sourceLabel: field(formData, "source_label"),
      sourceUrl: field(formData, "source_url"),
      sourceCheckedOn: field(formData, "source_checked_on"),
      sourceDocumentUrl: field(formData, "source_document_url"),
      sourceDocumentLabel: field(formData, "source_document_label"),
      assumeCondition: hasCondition ? field(formData, "assume_condition") === "on" : undefined,
    },
    "dutyDetails",
  );
}

// "0805.90.01 | Etrogs" per line; the description is optional. A line
// starting with "-" takes that statistical number out of the row
// ("-2931.90.9051": the subheading except that number).
export type ScopeInput = { prefix: string; description: string | null; excluded: boolean };

export function parseScopeLines(text: string): ParseResult<ScopeInput[]> {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length > 5000) return { ok: false, error: "Paste at most 5,000 scope lines at a time." };
  const out: ScopeInput[] = [];
  for (const [i, line] of lines.entries()) {
    const excluded = line.startsWith("-");
    const [code, ...rest] = (excluded ? line.slice(1) : line).split("|");
    const prefix = code.trim().replace(/[.\s]/g, "");
    if (!/^\d{4,10}$/.test(prefix)) {
      return { ok: false, error: `Scope line ${i + 1}: "${code.trim()}" isn't a 4- to 10-digit HTS code.` };
    }
    const description = rest.join("|").trim();
    if (description.length > 500) return { ok: false, error: `Scope line ${i + 1}: keep the description under 500 characters.` };
    if (excluded && description) return { ok: false, error: `Scope line ${i + 1}: an excepted number has no description.` };
    out.push({ prefix, description: description || null, excluded });
  }
  return { ok: true, data: out };
}

export type NewDuty = {
  programKey: string;
  authority: "section_301" | "section_232" | "section_338" | "section_201" | "other";
  chapter99Heading: string;
  chapter99HeadingAtMinimum: string | null;
  label: string;
  rateType: (typeof RATE_TYPES)[number];
  ratePct: number | null;
  originCountries: string[] | null;
  conditionText: string | null;
  assumeCondition: boolean;
  excludesPrograms: string[];
  exclusionHeading: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  legalStatus: (typeof LEGAL_STATUSES)[number];
  sourceLabel: string;
  sourceUrl: string;
  sourceCheckedOn: string;
  sourceDocumentUrl: string | null;
  sourceDocumentLabel: string | null;
  notes: string | null;
  scope: ScopeInput[];
};

const newDutySchema = z
  .object({
    programKey,
    authority: z.enum(["section_301", "section_232", "section_338", "section_201", "other"], { error: "Choose the authority." }),
    chapter99Heading: heading("The heading"),
    chapter99HeadingAtMinimum: z.union([z.literal(""), heading("The heading at the minimum")]).transform((v) => v || null),
    label: z.string().min(1, "Enter a label.").max(200, "Keep the label under 200 characters."),
    rateType: z.enum(RATE_TYPES, { error: "Choose the rate type." }),
    ratePct: z
      .string()
      .transform((v) => (v === "" ? null : Number(v)))
      .refine((v) => v == null || (Number.isFinite(v) && v > 0 && v <= 1000), "Enter the rate as a percentage above 0."),
    originCountries: z.array(z.string()).refine((codes) => codes.every(isOriginCountry), "Origins must be ISO country codes, e.g. VN, IN."),
    conditionText: optionalText(1000, "The condition"),
    assumeCondition: z.boolean(),
    excludesPrograms: z.array(z.string().regex(/^[a-z0-9_]+$/, "Excluding programs must be program keys.")),
    exclusionHeading: z.union([z.literal(""), heading("The exclusion heading")]).transform((v) => v || null),
    effectiveFrom: isoDate("the first day it applies"),
    effectiveTo: z.union([z.literal(""), isoDate("the last day it applies")]).transform((v) => v || null),
    legalStatus: z.enum(LEGAL_STATUSES, { error: "Choose a legal status." }),
    sourceLabel: z.string().min(1, "Enter the source.").max(500),
    sourceUrl: httpsUrl,
    sourceCheckedOn: isoDate("the date the source was checked"),
    sourceDocumentUrl: documentUrl,
    sourceDocumentLabel: documentLabel,
    notes: optionalText(2000, "Notes"),
  })
  .superRefine((d, ctx) => {
    const issue = (message: string) => ctx.addIssue({ code: "custom", message });
    if ((d.sourceDocumentUrl == null) !== (d.sourceDocumentLabel == null)) issue(DOCUMENT_PAIR);
    if (d.rateType === "exempt" && d.ratePct != null) issue("An exemption has no rate; leave the rate empty.");
    if ((d.rateType === "add" || d.rateType === "minimum_total") && d.ratePct == null) issue("Enter the rate.");
    if (d.rateType === "unconfirmed" && !d.conditionText) issue("Say what's unconfirmed in the condition.");
    if (d.rateType === "unconfirmed" && d.assumeCondition) issue("An unconfirmed row is never counted, so its condition can't be assumed.");
    if (d.assumeCondition && !d.conditionText) issue("Only a row with a condition can treat it as met.");
    if (d.rateType === "minimum_total" && !d.chapter99HeadingAtMinimum) {
      issue("A minimum-total row needs the heading used when the base rate already meets it.");
    }
    if (d.rateType !== "minimum_total" && d.chapter99HeadingAtMinimum) issue("Only minimum-total rows have a heading at the minimum.");
    if ((d.excludesPrograms.length === 0) !== (d.exclusionHeading == null)) {
      issue("Give both the excluding programs and the heading claimed when excluded, or neither.");
    }
    if (d.effectiveTo && d.effectiveTo < d.effectiveFrom) issue("The last day can't be before the first.");
  });

const list = (value: string) =>
  value
    .split(/[\s,]+/)
    .map((v) => v.trim())
    .filter(Boolean);

export function parseNewDuty(formData: FormData): ParseResult<NewDuty> {
  const parsed = run(
    newDutySchema,
    {
      programKey: field(formData, "program_key"),
      authority: field(formData, "authority"),
      chapter99Heading: field(formData, "chapter99_heading"),
      chapter99HeadingAtMinimum: field(formData, "chapter99_heading_at_minimum"),
      label: field(formData, "label"),
      rateType: field(formData, "rate_type"),
      ratePct: field(formData, "rate_pct"),
      originCountries: list(field(formData, "origin_countries").toUpperCase()),
      conditionText: field(formData, "condition_text"),
      assumeCondition: field(formData, "assume_condition") === "on",
      excludesPrograms: list(field(formData, "excludes_programs")),
      exclusionHeading: field(formData, "exclusion_heading"),
      effectiveFrom: field(formData, "effective_from"),
      effectiveTo: field(formData, "effective_to"),
      legalStatus: field(formData, "legal_status") || "in_force",
      sourceLabel: field(formData, "source_label"),
      sourceUrl: field(formData, "source_url"),
      sourceCheckedOn: field(formData, "source_checked_on"),
      sourceDocumentUrl: field(formData, "source_document_url"),
      sourceDocumentLabel: field(formData, "source_document_label"),
      notes: field(formData, "notes"),
    },
    "newDuty",
  );
  if (!parsed.ok) return parsed;
  const scope = parseScopeLines(field(formData, "scope"));
  if (!scope.ok) return scope;
  const d = parsed.data;
  return {
    ok: true,
    data: { ...d, originCountries: d.originCountries.length > 0 ? d.originCountries : null, scope: scope.data },
  };
}

export type NewFee = {
  feeCode: "mpf_formal" | "mpf_informal" | "hmf";
  label: string;
  ratePct: number | null;
  minUsd: number | null;
  maxUsd: number | null;
  flatUsd: number | null;
  appliesUpToValueUsd: number | null;
  effectiveFrom: string;
  sourceLabel: string;
  sourceUrl: string;
  notes: string | null;
};

const money = z
  .string()
  .transform((v) => (v === "" ? null : Number(v.replace(/,/g, ""))))
  .refine((v) => v == null || (Number.isFinite(v) && v >= 0), "Amounts must be numbers of 0 or more.");

export function parseNewFee(formData: FormData): ParseResult<NewFee> {
  return run(
    z
      .object({
        feeCode: z.enum(["mpf_formal", "mpf_informal", "hmf"], { error: "Choose the fee." }),
        label: z.string().min(1, "Enter a label.").max(200),
        ratePct: money,
        minUsd: money,
        maxUsd: money,
        flatUsd: money,
        appliesUpToValueUsd: money,
        effectiveFrom: isoDate("the first day it applies"),
        sourceLabel: z.string().min(1, "Enter the source.").max(500),
        sourceUrl: httpsUrl,
        notes: optionalText(2000, "Notes"),
      })
      .superRefine((d, ctx) => {
        const issue = (message: string) => ctx.addIssue({ code: "custom", message });
        if (d.feeCode === "mpf_formal" && (d.ratePct == null || d.minUsd == null || d.maxUsd == null)) {
          issue("Formal MPF needs the rate, minimum and maximum.");
        }
        if (d.feeCode === "mpf_formal" && d.minUsd != null && d.maxUsd != null && d.maxUsd < d.minUsd) {
          issue("The maximum can't be below the minimum.");
        }
        if (d.feeCode === "mpf_informal" && (d.flatUsd == null || d.appliesUpToValueUsd == null)) {
          issue("Informal MPF needs the flat fee and the value it applies up to.");
        }
        if (d.feeCode === "hmf" && d.ratePct == null) issue("HMF needs the rate.");
      }),
    {
      feeCode: field(formData, "fee_code"),
      label: field(formData, "label"),
      ratePct: field(formData, "rate_pct"),
      minUsd: field(formData, "min_usd"),
      maxUsd: field(formData, "max_usd"),
      flatUsd: field(formData, "flat_usd"),
      appliesUpToValueUsd: field(formData, "applies_up_to_value_usd"),
      effectiveFrom: field(formData, "effective_from"),
      sourceLabel: field(formData, "source_label"),
      sourceUrl: field(formData, "source_url"),
      notes: field(formData, "notes"),
    },
    "newFee",
  );
}

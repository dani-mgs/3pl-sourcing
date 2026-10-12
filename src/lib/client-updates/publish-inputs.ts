import { z } from "zod";
import { isIsoDate } from "./dates";
import { milestoneSchema, type Milestone } from "./payload-schema";

// What the expert fills in on the Publish form. The browser only ever sends
// these inputs; every figure in the payload is worked out on the server from
// live data (build-*-payload.ts). Stored, staff-only, in
// client_update_inputs so the next update can be prefilled.

export const MAX_MILESTONES = 6;
export const MAX_REASONS = 3;
export const MAX_TRADE_OFFS = 2;

export const SECTION_KEYS = ["funnel", "cost", "leadTime", "fcr", "validity"] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];
export type Sections = Record<SectionKey, boolean>;

export type PublishInputs = {
  stage: number;
  headline: string;
  summary: string;
  nextStep: string | null;
  nextStepDue: string | null;
  needsClientAction: boolean;
  milestones: Milestone[];
  partnerIds: string[];
  recommendedId: string | null;
  reasons: string[];
  tradeOffs: string[];
  basedOn: string | null;
  sections: Sections;
  includeAnnual: boolean;
  contactEmail: string | null;
};

const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label}: use ${max} characters or fewer.`)
    .transform((v) => (v === "" ? null : v));

const optionalDate = (label: string) =>
  z
    .string()
    .trim()
    .refine((v) => v === "" || isIsoDate(v), `${label}: use a real date.`)
    .transform((v) => (v === "" ? null : v));

const uuid = z.uuid();

export const publishInputsSchema = z.strictObject({
  stage: z.coerce.number().int().min(1, "Choose a stage.").max(7, "Choose a stage."),
  headline: z
    .string()
    .trim()
    .min(1, "Write a headline.")
    .max(120, "Headline: use 120 characters or fewer."),
  summary: z
    .string()
    .trim()
    .min(1, "Write where we are.")
    .max(1200, "Where we are: use 1,200 characters or fewer."),
  nextStep: optionalText(200, "Next step"),
  nextStepDue: optionalDate("Next step due"),
  needsClientAction: z.boolean(),
  milestones: z.array(milestoneSchema).max(MAX_MILESTONES),
  partnerIds: z.array(uuid).max(10),
  recommendedId: uuid.nullable(),
  reasons: z.array(z.string().trim().min(1).max(140, "Each reason: use 140 characters or fewer.")).max(MAX_REASONS),
  tradeOffs: z.array(z.string().trim().min(1).max(140, "Each trade-off: use 140 characters or fewer.")).max(MAX_TRADE_OFFS),
  basedOn: optionalText(120, "Based on"),
  sections: z.strictObject(Object.fromEntries(SECTION_KEYS.map((k) => [k, z.boolean()])) as Record<SectionKey, z.ZodBoolean>),
  includeAnnual: z.boolean(),
  contactEmail: z
    .string()
    .trim()
    .max(254, "Contact email: use 254 characters or fewer.")
    .refine((v) => v === "" || z.email().safeParse(v).success, "Contact email: enter a valid email address, or leave it empty.")
    .transform((v) => (v === "" ? null : v.toLowerCase())),
});

function str(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function filled(values: string[]): string[] {
  return values.map((v) => v.trim()).filter((v) => v !== "");
}

export type ParsePublishResult = { ok: true; data: PublishInputs } | { ok: false; error: string };

export function parsePublishForm(formData: FormData): ParsePublishResult {
  const milestones: unknown[] = [];
  for (let i = 0; i < MAX_MILESTONES; i++) {
    const label = str(formData, `milestone_label_${i}`).trim();
    const planned = str(formData, `milestone_planned_${i}`).trim();
    const actual = str(formData, `milestone_actual_${i}`).trim();
    if (!label && !planned && !actual) continue;
    if (!label) return { ok: false, error: "Give every milestone a name, or clear its dates." };
    if ((planned && !isIsoDate(planned)) || (actual && !isIsoDate(actual))) {
      return { ok: false, error: `Milestone "${label.slice(0, 40)}": use real dates.` };
    }
    if (!planned && !actual) return { ok: false, error: `Milestone "${label.slice(0, 40)}": add a planned or actual date.` };
    milestones.push({ label, planned: planned || null, actual: actual || null });
  }

  const recommended = str(formData, "recommendedId").trim();
  const raw = {
    stage: str(formData, "stage"),
    headline: str(formData, "headline"),
    summary: str(formData, "summary"),
    nextStep: str(formData, "nextStep"),
    nextStepDue: str(formData, "nextStepDue"),
    needsClientAction: formData.get("needsClientAction") === "on",
    milestones,
    partnerIds: [...new Set(formData.getAll("partnerIds").filter((v): v is string => typeof v === "string"))],
    recommendedId: recommended === "" ? null : recommended,
    reasons: filled([0, 1, 2].map((i) => str(formData, `reason_${i}`))),
    tradeOffs: filled([0, 1].map((i) => str(formData, `tradeOff_${i}`))),
    basedOn: str(formData, "basedOn"),
    sections: Object.fromEntries(SECTION_KEYS.map((k) => [k, formData.get(`section_${k}`) === "on"])),
    includeAnnual: formData.get("includeAnnual") === "on",
    contactEmail: str(formData, "contactEmail"),
  };

  const result = publishInputsSchema.safeParse(raw);
  if (!result.success) {
    const issue = result.error.issues[0];
    const field = String(issue?.path[0] ?? "");
    const generic: Record<string, string> = {
      partnerIds: "Choose partners from the list.",
      recommendedId: "Choose the recommended partner from the list.",
      milestones: "Check the milestones.",
    };
    return { ok: false, error: generic[field] ?? issue?.message ?? "Check the form." };
  }
  const data = result.data as PublishInputs;
  if (data.recommendedId && !data.partnerIds.includes(data.recommendedId)) {
    return { ok: false, error: "Include the recommended partner in the partners you share." };
  }
  return { ok: true, data };
}

// The stored (already parsed) shape.
const storedInputsSchema = z.strictObject({
  stage: z.number().int().min(1).max(7),
  headline: z.string().min(1).max(120),
  summary: z.string().min(1).max(1200),
  nextStep: z.string().max(200).nullable(),
  nextStepDue: z.string().refine(isIsoDate).nullable(),
  needsClientAction: z.boolean(),
  milestones: z.array(milestoneSchema).max(MAX_MILESTONES),
  partnerIds: z.array(uuid).max(10),
  recommendedId: uuid.nullable(),
  reasons: z.array(z.string().min(1).max(140)).max(MAX_REASONS),
  tradeOffs: z.array(z.string().min(1).max(140)).max(MAX_TRADE_OFFS),
  basedOn: z.string().max(120).nullable(),
  sections: z.strictObject(Object.fromEntries(SECTION_KEYS.map((k) => [k, z.boolean()])) as Record<SectionKey, z.ZodBoolean>),
  includeAnnual: z.boolean(),
  contactEmail: z.email().max(254).nullable(),
});

// Stored inputs from an earlier update, checked before they prefill a form.
export function parseStoredInputs(value: unknown): PublishInputs | null {
  const result = storedInputsSchema.safeParse(value);
  return result.success ? (result.data as PublishInputs) : null;
}

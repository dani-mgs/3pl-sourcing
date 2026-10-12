import { z } from "zod";
import { isIsoDate } from "./dates";

// The client-update payload: the ONLY shape of data that leaves Move for a
// client. Every object is strict, so a key that isn't listed here is refused
// before it's stored (and again when it's rendered). Adding a key means
// adding it here, to the path lists in payload-allow-list.test.ts and,
// for a top-level key, to client_update_payload_ok() in a migration.
//
// Never put internal columns here: notes, assessment, next action, key
// notes, sources, key strength / weakness, assumptions, contact details,
// internal status words, or annual savings unless the expert ticked
// "include annual estimate" (docs/SECURITY.md, "Client updates").

export const PAYLOAD_VERSION = 1;

// Must equal the list in client_update_payload_ok() (payload-allow-list.test.ts).
export const PAYLOAD_TOP_LEVEL_KEYS = [
  "v",
  "kind",
  "project",
  "author",
  "contact",
  "milestones",
  "funnel",
  "comparison",
  "recommendation",
] as const;

export const FUNNEL_STEPS = [
  "contacted",
  "replied",
  "quoted",
  "like_for_like",
  "shortlisted",
  "recommended",
] as const;
export type FunnelStep = (typeof FUNNEL_STEPS)[number];

// How a shared forwarder quote compares with the project's agreed terms.
// Only "like_for_like" can be "best" or show a saving.
export const COMPARABILITY = [
  "like_for_like",
  "different_terms",
  "expired",
  "not_comparable",
  "no_price",
] as const;
export type Comparability = (typeof COMPARABILITY)[number];

const isoDate = z.string().refine(isIsoDate, "Use a real date.");
const text = (max: number) => z.string().trim().min(1).max(max);
const count = z.number().int().min(0).max(100_000);
const money = z.number().finite().min(0).max(1e10);
const signedMoney = z.number().finite().min(-1e10).max(1e10);
const fraction = z.number().finite().min(-100).max(100);
const days = z.number().finite().min(0).max(1000);
const percentText = z.string().regex(/^\d{1,4}\.\d%$/);

export const milestoneSchema = z.strictObject({
  label: text(60),
  planned: isoDate.nullable(),
  actual: isoDate.nullable(),
});

const projectSchema = z.strictObject({
  route: text(160).nullable(),
  facts: z.array(text(80)).max(6),
});

const authorSchema = z.strictObject({ firstName: text(60).nullable() });

const contactSchema = z.strictObject({
  firstName: text(60).nullable(),
  email: z.email().max(254).nullable(),
});

const funnelSchema = z
  .array(z.strictObject({ step: z.enum(FUNNEL_STEPS), count }))
  .max(FUNNEL_STEPS.length)
  .nullable();

const recommendationSchema = z
  .strictObject({
    name: text(120),
    reasons: z.array(text(140)).max(3),
    tradeOffs: z.array(text(140)).max(2),
    basedOn: text(120).nullable(),
  })
  .nullable();

const role = z.enum(["recommended", "backup"]);

const forwarderOptionSchema = z.strictObject({
  name: text(120),
  role,
  comparability: z.enum(COMPARABILITY),
  costUsd: money.nullable(),
  savingPct: fraction.nullable(),
  savingUsd: signedMoney.nullable(),
  leadMinDays: days.nullable(),
  leadMaxDays: days.nullable(),
  fcrPct: percentText.nullable(),
  validUntil: isoDate.nullable(),
});

const forwarderComparisonSchema = z.strictObject({
  kind: z.literal("forwarder"),
  counts: z.strictObject({ quoted: count, likeForLike: count, differentTerms: count, expired: count }),
  show: z.strictObject({ cost: z.boolean(), leadTime: z.boolean(), fcr: z.boolean(), validity: z.boolean() }),
  today: z.strictObject({ costUsd: money.nullable(), leadTimeDays: days.nullable(), fcrPct: percentText.nullable() }),
  targetLeadTimeDays: days.nullable(),
  options: z.array(forwarderOptionSchema).max(10),
  emptyCost: z.enum(["too_few", "only_different_terms", "no_shortlist"]).nullable(),
  savingsNote: z.enum(["no_baseline"]).nullable(),
  fcrIssue: z.enum(["missing", "not_usd"]).nullable(),
  bestSaving: z.strictObject({ name: text(120), pct: fraction, usd: signedMoney }).nullable(),
  annual: z.strictObject({ savingUsd: signedMoney, shipmentsPerYear: z.number().finite().min(0).max(100_000) }).nullable(),
});

const threePlOptionSchema = z.strictObject({
  name: text(120),
  role,
  location: text(120).nullable(),
  // Share of today's rate-card total; amounts are never shared for 3PLs.
  savingPct: fraction.nullable(),
});

const threePlComparisonSchema = z.strictObject({
  kind: z.literal("three_pl"),
  quoted: count,
  show: z.strictObject({ cost: z.boolean() }),
  options: z.array(threePlOptionSchema).max(10),
  emptyCost: z.enum(["no_baseline", "mixed_currencies", "too_few"]).nullable(),
  bestSaving: z.strictObject({ name: text(120), pct: fraction }).nullable(),
});

const common = {
  v: z.literal(PAYLOAD_VERSION),
  project: projectSchema,
  author: authorSchema,
  contact: contactSchema,
  milestones: z.array(milestoneSchema).max(8),
  funnel: funnelSchema,
  recommendation: recommendationSchema,
};

export const forwarderPayloadSchema = z.strictObject({
  ...common,
  kind: z.literal("forwarder"),
  comparison: forwarderComparisonSchema,
});

export const threePlPayloadSchema = z.strictObject({
  ...common,
  kind: z.literal("three_pl"),
  comparison: threePlComparisonSchema,
});

export const clientUpdatePayloadSchema = z.discriminatedUnion("kind", [
  forwarderPayloadSchema,
  threePlPayloadSchema,
]);

export type ForwarderPayload = z.infer<typeof forwarderPayloadSchema>;
export type ThreePlPayload = z.infer<typeof threePlPayloadSchema>;
export type ClientUpdatePayload = z.infer<typeof clientUpdatePayloadSchema>;
export type ForwarderOption = ForwarderPayload["comparison"]["options"][number];
export type ThreePlOption = ThreePlPayload["comparison"]["options"][number];
export type Milestone = z.infer<typeof milestoneSchema>;

// For rendering: a payload that doesn't parse (an unknown version, a bad
// row) is shown as "can't be shown", never as raw data.
export function parsePayload(value: unknown): ClientUpdatePayload | null {
  const result = clientUpdatePayloadSchema.safeParse(value);
  return result.success ? result.data : null;
}

import { z } from "zod";

// The Market Report payload: the ONLY shape of data a paid client sees about
// the whole forwarder search. Every object is strict, so a key that isn't
// listed here is refused before it's stored (and again when it's rendered).
// Adding a key means adding it here, to the path lists in
// market-report-allow-list.test.ts and, for a top-level key, to
// market_report_payload_ok() in a migration.
//
// Shortlisted partners are named. Every other partner is a letter ("Partner
// E") and carries ONLY: the letter, the exact price, the lead-time range, a
// like-for-like flag, an outcome from a fixed list, a size band and a region
// from fixed lists, and the optional "Move's take". Partners Move stopped
// considering ("Not taken forward") carry only the letter, the outcome, the
// size band and the region. Never: names, cities, websites, contacts,
// validity dates, incoterms, services, certifications, notes or statuses.

export const MARKET_REPORT_VERSION = 1;

// Must equal the list in market_report_payload_ok() (market-report-allow-list.test.ts).
export const MARKET_REPORT_TOP_LEVEL_KEYS = ["v", "kind", "project", "author", "today", "partners"] as const;

export const SIZE_BANDS = ["small", "mid_size", "large", "global"] as const;
export type SizeBand = (typeof SIZE_BANDS)[number];
export const SIZE_LABELS: Record<SizeBand, string> = {
  small: "Small",
  mid_size: "Mid-size",
  large: "Large",
  global: "Global",
};

export const REGIONS = [
  "southeast_asia",
  "east_asia",
  "south_asia",
  "europe",
  "north_america",
  "latin_america",
  "middle_east",
  "africa",
  "oceania",
] as const;
export type Region = (typeof REGIONS)[number];
export const REGION_LABELS: Record<Region, string> = {
  southeast_asia: "Southeast Asia",
  east_asia: "East Asia",
  south_asia: "South Asia",
  europe: "Europe",
  north_america: "North America",
  latin_america: "Latin America",
  middle_east: "Middle East",
  africa: "Africa",
  oceania: "Oceania",
};

// What happened to each partner, in the report's order. Unfit, Do Not
// Contact and Withdrawn / No Response all become "not_taken_forward", so the
// client can't tell which it was.
export const REPORT_OUTCOMES = [
  "recommended",
  "shortlisted",
  "quoted_not_selected",
  "quote_expired",
  "different_terms",
  "didnt_quote",
  "not_taken_forward",
] as const;
export type ReportOutcome = (typeof REPORT_OUTCOMES)[number];

export const TAKE_MAX = 120;

const text = (max: number) => z.string().trim().min(1).max(max);
const money = z.number().finite().min(0).max(1e10);
const days = z.number().finite().min(0).max(1000);
const size = z.enum(SIZE_BANDS).nullable();
const region = z.enum(REGIONS).nullable();
const label = z.string().regex(/^Partner [A-Z]{1,2}$/);

const quoted = {
  priceUsd: money.nullable(),
  leadMinDays: days.nullable(),
  leadMaxDays: days.nullable(),
  likeForLike: z.boolean(),
  size,
  region,
  take: text(TAKE_MAX).nullable(),
};

export const namedPartnerSchema = z.strictObject({
  name: text(120),
  outcome: z.enum(["recommended", "shortlisted"]),
  ...quoted,
});

export const anonymousPartnerSchema = z.strictObject({
  label,
  outcome: z.enum(["quoted_not_selected", "quote_expired", "different_terms", "didnt_quote"]),
  ...quoted,
});

export const notTakenForwardSchema = z.strictObject({
  label,
  outcome: z.literal("not_taken_forward"),
  size,
  region,
});

export const reportPartnerSchema = z.union([namedPartnerSchema, anonymousPartnerSchema, notTakenForwardSchema]);

export const marketReportPayloadSchema = z.strictObject({
  v: z.literal(MARKET_REPORT_VERSION),
  kind: z.literal("market_report"),
  project: z.strictObject({ route: text(160).nullable(), facts: z.array(text(80)).max(6) }),
  author: z.strictObject({ firstName: text(60).nullable() }),
  today: z.strictObject({ costUsd: money.nullable() }),
  partners: z.array(reportPartnerSchema).max(200),
});

export type MarketReportPayload = z.infer<typeof marketReportPayloadSchema>;
export type ReportPartner = z.infer<typeof reportPartnerSchema>;
export type NamedPartner = z.infer<typeof namedPartnerSchema>;
export type AnonymousPartner = z.infer<typeof anonymousPartnerSchema>;

export function isNotTakenForward(p: ReportPartner): p is z.infer<typeof notTakenForwardSchema> {
  return p.outcome === "not_taken_forward";
}

// For rendering: a payload that doesn't parse is "can't be shown", never raw.
export function parseMarketReport(value: unknown): MarketReportPayload | null {
  const result = marketReportPayloadSchema.safeParse(value);
  return result.success ? result.data : null;
}

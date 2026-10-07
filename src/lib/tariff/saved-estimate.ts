import { z } from "zod";
import { parseInputSnapshot, type InputSnapshot } from "./forwarder-link";
import type { EstimateResult } from "./server-estimate";

// Reads a saved duty_estimates row back into the shape the result view
// shows. The jsonb snapshot columns are validated, so a malformed row shows
// as unavailable instead of breaking the page.

export const SAVED_ESTIMATE_COLUMNS =
  "id, created_at, created_by, label, as_of_date, entry_date, hts_code, hts_description, hts_ancestor_descriptions, " +
  "hts_release_name, hts_release_title, hts_release_start_date, rate_column, rate_text, special_rate_text, " +
  "origin_country, shipment_mode, customs_value_original, original_currency, exchange_rate_to_usd, " +
  "exchange_rate_source, exchange_rate_date, customs_value_usd, quantity, quantity_unit, base_duty_usd, " +
  "fees_usd, total_usd, lines, warnings, additional_duties_usd, duty_reviews, freight_insurance_deduction_usd, " +
  "forwarder_project_id, forwarder_quote_id, input_snapshot";

const lineSchema = z.object({
  kind: z.enum(["duty", "additional", "fee"]),
  code: z.string(),
  label: z.string(),
  rateText: z.string(),
  amountUsd: z.number(),
  detail: z.string().nullable(),
  sourceLabel: z.string(),
  sourceUrl: z.string(),
  effectiveFrom: z.string().nullable(),
  heading: z.string().optional(),
  effectiveTo: z.string().nullable().optional(),
  legalStatus: z.string().optional(),
  sourceCheckedOn: z.string().optional(),
  notes: z.array(z.string()).optional(),
});

const warningSchema = z.object({
  programKey: z.string(),
  name: z.string(),
  text: z.string(),
  sourceLabel: z.string(),
  sourceUrl: z.string(),
  indicativePct: z.number().nonnegative().nullish(),
  kind: z.enum(["not_loaded", "pending_review", "depends_on", "exempt_pending", "unconfirmed", "conditional"]).optional(),
  hint: z.string().nullable().optional(),
  counted: z.boolean().optional(),
});

const dutyReviewSchema = z.object({
  programKey: z.string(),
  name: z.string(),
  status: z.enum(["not_loaded", "pending_review", "reviewed"]),
  reviewedAt: z.string().nullable(),
  reviewedByName: z.string().nullable(),
  staleReason: z.string().nullable(),
});

const rowSchema = z.object({
  id: z.string(),
  created_at: z.string(),
  created_by: z.string(),
  label: z.string().nullable(),
  as_of_date: z.string(),
  // Rows saved before the expected entry date existed were backfilled with as_of_date.
  entry_date: z.string().nullish(),
  hts_code: z.string(),
  hts_description: z.string(),
  hts_ancestor_descriptions: z.array(z.string()),
  hts_release_name: z.string(),
  hts_release_title: z.string().nullable(),
  hts_release_start_date: z.string().nullable(),
  rate_column: z.enum(["general", "column2"]),
  rate_text: z.string(),
  special_rate_text: z.string().nullable(),
  origin_country: z.string(),
  shipment_mode: z.enum(["Air", "Sea", "Road"]),
  customs_value_original: z.union([z.number(), z.string()]),
  original_currency: z.string(),
  exchange_rate_to_usd: z.union([z.number(), z.string()]),
  exchange_rate_source: z.enum(["daily_feed", "manual"]).nullable(),
  exchange_rate_date: z.string().nullable(),
  customs_value_usd: z.union([z.number(), z.string()]),
  quantity: z.union([z.number(), z.string()]).nullable(),
  quantity_unit: z.string().nullable(),
  base_duty_usd: z.union([z.number(), z.string()]),
  fees_usd: z.union([z.number(), z.string()]),
  total_usd: z.union([z.number(), z.string()]),
  lines: z.array(lineSchema),
  warnings: z.array(warningSchema),
  // Rows saved before additional duties existed default to none.
  additional_duties_usd: z.union([z.number(), z.string()]).optional().default(0),
  duty_reviews: z.array(dutyReviewSchema).optional().default([]),
  freight_insurance_deduction_usd: z.union([z.number(), z.string()]).nullable().optional().default(null),
  forwarder_project_id: z.string().nullable().optional().default(null),
  forwarder_quote_id: z.string().nullable().optional().default(null),
  input_snapshot: z.unknown().optional().default(null),
});

export type SavedEstimate = {
  id: string;
  createdAt: string;
  createdBy: string;
  label: string | null;
  // Set when saved from a forwarder project or quote.
  link: { projectId: string; quoteId: string | null; snapshot: InputSnapshot | null } | null;
  estimate: EstimateResult;
};

export function rowToSavedEstimate(row: unknown): SavedEstimate | null {
  const parsed = rowSchema.safeParse(row);
  if (!parsed.success) {
    console.error("rowToSavedEstimate: unexpected row shape", parsed.error.issues.slice(0, 3));
    return null;
  }
  const r = parsed.data;
  return {
    id: r.id,
    createdAt: r.created_at,
    createdBy: r.created_by,
    label: r.label,
    link: r.forwarder_project_id
      ? {
          projectId: r.forwarder_project_id,
          quoteId: r.forwarder_quote_id,
          snapshot: parseInputSnapshot(r.input_snapshot),
        }
      : null,
    estimate: {
      asOfDate: r.as_of_date,
      entryDate: r.entry_date ?? r.as_of_date,
      htsCode: r.hts_code,
      matchedTenDigit: false,
      description: r.hts_description,
      ancestorDescriptions: r.hts_ancestor_descriptions,
      units: [],
      specialRateText: r.special_rate_text,
      release: {
        name: r.hts_release_name,
        title: r.hts_release_title,
        release_start_date: r.hts_release_start_date,
      },
      originCountry: r.origin_country,
      shipmentMode: r.shipment_mode,
      customsValueOriginal: String(r.customs_value_original),
      currency: r.original_currency,
      exchangeRateToUsd: String(r.exchange_rate_to_usd),
      exchangeRateSource: r.exchange_rate_source,
      exchangeRateDate: r.exchange_rate_date,
      customsValueUsd: Number(r.customs_value_usd),
      deductionUsd: r.freight_insurance_deduction_usd == null ? null : Number(r.freight_insurance_deduction_usd),
      rateColumn: r.rate_column,
      rateText: r.rate_text,
      quantityUsed:
        r.quantity != null && r.quantity_unit
          ? { value: Number(r.quantity), unit: r.quantity_unit, unitLabel: r.quantity_unit }
          : null,
      baseDutyUsd: Number(r.base_duty_usd),
      additionalDutiesUsd: Number(r.additional_duties_usd),
      feesUsd: Number(r.fees_usd),
      totalUsd: Number(r.total_usd),
      lines: r.lines,
      warnings: r.warnings,
      dutyReviews: r.duty_reviews,
    },
  };
}

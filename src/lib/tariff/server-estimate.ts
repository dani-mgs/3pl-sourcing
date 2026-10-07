import type { createClient } from "@/lib/supabase/server";
import { todayUtc } from "@/lib/fx/server-rates";
import { formatRateDate, verifyRateProvenance } from "@/lib/fx/rate-provenance";
import {
  calculateEstimate,
  type EstimateLine,
  type FeeRow,
  type ReleaseInfo,
  type ShipmentMode,
} from "./calculate";
import { checkEntryDate } from "./entry-date";
import { formatHtsCode } from "./hts-code";
import { evaluateAdditionalDuties, type DutyReviewNote } from "./additional-duties";
import type { DutyProgramRow, ProgramWarning } from "./programs";
import { centsToNumber, parseDecimal, toCents } from "./rational";
import { loadAdditionalDutyData } from "./server-duty-data";
import type { EstimateFormData } from "./parse-estimate-form";
import { customsValueAfterDeduction } from "./forwarder-link";

// Builds an estimate on the server from validated form data: the current
// HTS release and line, the fees and column 2 list in force today, the
// program warnings, and the verified exchange rate. The preview and the save
// action both call this, so a saved estimate never trusts numbers from the
// browser. Reads go through the signed-in user's client (all readable by any
// signed-in user).

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type EstimateResult = {
  // The day the estimate was calculated (todayUtc(); "Calculated on"). FX
  // provenance and duty-data review age are judged on this day.
  asOfDate: string;
  // The day the goods are expected to enter the US. Fees, column 2 countries
  // and additional duty rows are those in force on this day; the base HTS rate
  // is always the current release's.
  entryDate: string;
  htsCode: string;
  // The user typed 8 digits and the HTS only has one 10-digit line under it.
  matchedTenDigit: boolean;
  description: string;
  ancestorDescriptions: string[];
  units: string[];
  specialRateText: string | null;
  release: ReleaseInfo;
  originCountry: string;
  shipmentMode: ShipmentMode;
  customsValueOriginal: string;
  currency: string;
  exchangeRateToUsd: string;
  exchangeRateSource: "daily_feed" | "manual" | null;
  exchangeRateDate: string | null;
  customsValueUsd: number;
  // International freight and insurance taken out of a delivered-terms
  // invoice price (linked estimates only); customsValueUsd is net of it.
  deductionUsd: number | null;
  rateColumn: "general" | "column2";
  rateText: string;
  quantityUsed: { value: number; unit: string; unitLabel: string } | null;
  baseDutyUsd: number;
  // Reviewed additional duties only.
  additionalDutiesUsd: number;
  feesUsd: number;
  totalUsd: number;
  // Base duty, then additional duties, then fees.
  lines: EstimateLine[];
  // Programs that may apply but aren't in the total, and pending notes.
  warnings: ProgramWarning[];
  // Review state of each program that bears on this line.
  dutyReviews: DutyReviewNote[];
};

export type BuildEstimateResult = { ok: true; estimate: EstimateResult } | { ok: false; error: string };

const UNEXPECTED = "An unexpected error occurred.";

export type HtsLineRecord = {
  hts_code: string;
  description: string;
  ancestor_descriptions: string[];
  units: string[];
  general_rate: string | null;
  special_rate: string | null;
  other_rate: string | null;
};

const LINE_COLUMNS =
  "hts_code, description, ancestor_descriptions, units, general_rate, special_rate, other_rate";

type DatedRow = { effective_from: string | null; effective_to: string | null };

export function inForce(row: DatedRow, date: string): boolean {
  return (row.effective_from == null || row.effective_from <= date) &&
    (row.effective_to == null || row.effective_to >= date);
}

// Exact 8- or 10-digit match. An 8-digit code with no line of its own (the
// HTS merges 8471.30.01 into 8471.30.01.00) matches its only 10-digit line;
// with several, the user must choose.
export async function findLine(
  supabase: Supabase,
  releaseId: string,
  digits: string,
): Promise<{ line: HtsLineRecord; matchedTenDigit: boolean } | { error: string } | null> {
  const { data: exact, error } = await supabase
    .from("hts_lines")
    .select(LINE_COLUMNS)
    .eq("release_id", releaseId)
    .eq("hts_code", digits)
    .maybeSingle();
  if (error) throw error;
  if (exact) return { line: exact as HtsLineRecord, matchedTenDigit: false };
  if (digits.length !== 8) return null;

  const { data: children, error: childError } = await supabase
    .from("hts_lines")
    .select(LINE_COLUMNS)
    .eq("release_id", releaseId)
    .like("hts_code", `${digits}__`)
    .limit(20);
  if (childError) throw childError;
  if (!children || children.length === 0) return null;
  if (children.length > 1) {
    return {
      error: `${formatHtsCode(digits)} has several 10-digit statistical lines. Enter the full 10-digit code.`,
    };
  }
  return { line: children[0] as HtsLineRecord, matchedTenDigit: true };
}

// `calculatedOn` defaults to today (UTC); the actions read it once and pass
// it to the form parser too.
export async function buildEstimate(
  supabase: Supabase,
  input: EstimateFormData,
  calculatedOn: string = todayUtc(),
): Promise<BuildEstimateResult> {
  const asOfDate = calculatedOn;
  const entry = checkEntryDate(input.entryDate, asOfDate);
  if (!entry.ok) return { ok: false, error: entry.error };
  const entryDate = entry.date;
  try {
    const { data: release, error: releaseError } = await supabase
      .from("hts_releases")
      .select("id, name, title, release_start_date")
      .eq("status", "current")
      .maybeSingle();
    if (releaseError) throw releaseError;
    if (!release) {
      return { ok: false, error: "HTS data hasn't been imported yet. Try again later." };
    }

    const found = await findLine(supabase, release.id, input.htsDigits);
    if (!found) {
      return {
        ok: false,
        error: `${formatHtsCode(input.htsDigits)} isn't in the current HTS (${release.title ?? release.name}). Check the code.`,
      };
    }
    if ("error" in found) return { ok: false, error: found.error };
    const { line, matchedTenDigit } = found;

    const [feesResult, column2Result, programsResult] = await Promise.all([
      supabase
        .from("customs_fees")
        .select(
          "fee_code, label, rate_pct, min_usd, max_usd, flat_usd, applies_up_to_value_usd, effective_from, effective_to, source_label, source_url",
        ),
      supabase
        .from("hts_column2_countries")
        .select("effective_from, effective_to")
        .eq("country_code", input.originCountry),
      supabase
        .from("duty_programs")
        .select(
          "key, name, status, warning_text, trigger_origins, trigger_hts_prefixes, indicative_rates, source_label, source_url, sort_order",
        ),
    ]);
    for (const result of [feesResult, column2Result, programsResult]) {
      if (result.error) throw result.error;
    }

    const fees = ((feesResult.data ?? []) as (FeeRow & DatedRow)[]).filter((f) => inForce(f, entryDate));
    const originIsColumn2 = ((column2Result.data ?? []) as DatedRow[]).some((r) => inForce(r, entryDate));
    const programs = (programsResult.data ?? []) as DutyProgramRow[];

    let exchangeRateSource: EstimateResult["exchangeRateSource"] = null;
    let exchangeRateDate: string | null = null;
    if (input.currency !== "USD") {
      const verified = await verifyRateProvenance(
        {
          original_currency: input.currency,
          exchange_rate_to_usd: Number(input.exchangeRate),
          exchange_rate_source: input.exchangeRateSource,
          exchange_rate_date: input.exchangeRateDate,
        },
        null,
        asOfDate,
        async (currency, rateDate) => {
          const { data: row } = await supabase
            .from("fx_rates")
            .select("rate_to_usd")
            .eq("currency", currency)
            .eq("rate_date", rateDate)
            .maybeSingle();
          return row ? Number(row.rate_to_usd) : null;
        },
      );
      // The form can only claim daily_feed or manual; anything else is manual.
      exchangeRateSource = verified.source === "daily_feed" ? "daily_feed" : "manual";
      exchangeRateDate = exchangeRateSource === "manual" ? asOfDate : verified.date;
    }

    const value = customsValueAfterDeduction(input.customsValue, input.exchangeRate, input.deductionUsd);
    if (!value.ok) return { ok: false, error: value.error };
    const { customsValueUsd } = value;
    const releaseInfo: ReleaseInfo = {
      name: release.name,
      title: release.title,
      release_start_date: release.release_start_date,
    };
    const calculation = calculateEstimate({
      line,
      release: releaseInfo,
      originIsColumn2,
      shipmentMode: input.shipmentMode,
      customsValueUsd,
      quantity: input.quantity ? parseDecimal(input.quantity) : null,
      fees,
    });

    if (!calculation.ok) {
      switch (calculation.reason) {
        case "no_rate":
          return {
            ok: false,
            error: `${formatHtsCode(line.hts_code)} has no rate of duty in the current HTS. Check the code with your customs broker.`,
          };
        case "unsupported_rate":
          return {
            ok: false,
            error: `The rate for ${formatHtsCode(line.hts_code)} ("${calculation.rateText}") depends on details this calculator can't evaluate, such as content weight or component values. Ask your customs broker for this one.`,
          };
        case "quantity_required":
          return {
            ok: false,
            error: `The rate for ${formatHtsCode(line.hts_code)} is charged per unit. Enter the quantity in ${calculation.unitLabel}.`,
          };
        case "missing_fee":
          console.error(`buildEstimate: no ${calculation.feeCode} row in force on ${entryDate}`);
          return {
            ok: false,
            error: `Fee rates for ${entryDate === asOfDate ? "today" : formatRateDate(entryDate)} aren't set up yet, so the estimate can't be completed. Ask an admin to add them.`,
          };
      }
    }

    const dutyData = await loadAdditionalDutyData(supabase, line.hts_code, entryDate);
    const additional = evaluateAdditionalDuties({
      programs,
      rows: dutyData.rows,
      reviews: dutyData.reviews,
      originCountry: input.originCountry,
      htsCode: line.hts_code,
      customsValueUsd,
      baseDutyUsd: parseDecimal(calculation.baseDutyUsd),
      // Review age is measured to the day of calculation, not the entry date.
      asOfDate,
    });
    const [baseLine, ...feeLines] = calculation.lines;
    // Sum in cents so the total equals its parts exactly.
    const totalCents =
      toCents(parseDecimal(calculation.baseDutyUsd)) +
      toCents(parseDecimal(additional.additionalDutiesUsd)) +
      toCents(parseDecimal(calculation.feesUsd));

    return {
      ok: true,
      estimate: {
        asOfDate,
        entryDate,
        htsCode: line.hts_code,
        matchedTenDigit,
        description: line.description,
        ancestorDescriptions: line.ancestor_descriptions ?? [],
        units: line.units ?? [],
        specialRateText: line.special_rate,
        release: releaseInfo,
        originCountry: input.originCountry,
        shipmentMode: input.shipmentMode,
        customsValueOriginal: input.customsValue,
        currency: input.currency,
        exchangeRateToUsd: input.exchangeRate,
        exchangeRateSource,
        exchangeRateDate,
        customsValueUsd: centsToNumber(toCents(customsValueUsd)),
        deductionUsd: input.deductionUsd == null ? null : Number(input.deductionUsd),
        rateColumn: calculation.rateColumn,
        rateText: calculation.rateText,
        quantityUsed: calculation.quantityUsed,
        baseDutyUsd: calculation.baseDutyUsd,
        additionalDutiesUsd: additional.additionalDutiesUsd,
        feesUsd: calculation.feesUsd,
        totalUsd: centsToNumber(totalCents),
        lines: [baseLine, ...additional.lines, ...feeLines],
        warnings: additional.warnings,
        dutyReviews: additional.dutyReviews,
      },
    };
  } catch (error) {
    console.error("buildEstimate error:", error);
    return { ok: false, error: UNEXPECTED };
  }
}

// The duty_estimates row for a built estimate (created_by defaults to the
// signed-in user and is checked by RLS).
export function estimateToRow(estimate: EstimateResult, label: string | null) {
  return {
    label,
    as_of_date: estimate.asOfDate,
    entry_date: estimate.entryDate,
    hts_code: estimate.htsCode,
    hts_description: estimate.description,
    hts_ancestor_descriptions: estimate.ancestorDescriptions,
    hts_release_name: estimate.release.name,
    hts_release_title: estimate.release.title,
    hts_release_start_date: estimate.release.release_start_date,
    rate_column: estimate.rateColumn,
    rate_text: estimate.rateText,
    special_rate_text: estimate.specialRateText,
    origin_country: estimate.originCountry,
    shipment_mode: estimate.shipmentMode,
    customs_value_original: estimate.customsValueOriginal,
    original_currency: estimate.currency,
    exchange_rate_to_usd: estimate.exchangeRateToUsd,
    exchange_rate_source: estimate.exchangeRateSource,
    exchange_rate_date: estimate.exchangeRateDate,
    customs_value_usd: estimate.customsValueUsd,
    freight_insurance_deduction_usd: estimate.deductionUsd,
    quantity: estimate.quantityUsed?.value ?? null,
    quantity_unit: estimate.quantityUsed?.unitLabel ?? null,
    base_duty_usd: estimate.baseDutyUsd,
    additional_duties_usd: estimate.additionalDutiesUsd,
    fees_usd: estimate.feesUsd,
    total_usd: estimate.totalUsd,
    lines: estimate.lines,
    warnings: estimate.warnings,
    duty_reviews: estimate.dutyReviews,
  };
}

import { formatCurrency } from "@/lib/currency";
import { parseRateText } from "./rate-text";
import {
  ZERO,
  add,
  centsToNumber,
  centsToRational,
  compare,
  div,
  fromInteger,
  mul,
  parseDecimal,
  toCents,
  toFixed,
  type Rational,
} from "./rational";

// The base-duty estimate: the HTS rate for the line (column 1 general, or
// column 2 for origins on that list), plus MPF and HMF. Pure: every rate comes
// in from the database rows passed here, none is hardcoded.
//
// Rounding: amounts are exact until each line is rounded once, half-up to the
// cent. The MPF minimum and maximum are applied after rounding, and to this
// one line as if it were the whole entry. Additional duties (Section 301,
// 232, …) aren't calculated yet; matching programs are listed as warnings.

export type ShipmentMode = "Air" | "Sea" | "Road";
export const SHIPMENT_MODES: readonly ShipmentMode[] = ["Sea", "Air", "Road"];

export type FeeCode = "mpf_formal" | "mpf_informal" | "hmf";

export type FeeRow = {
  fee_code: FeeCode;
  label: string;
  rate_pct: number | string | null;
  min_usd: number | string | null;
  max_usd: number | string | null;
  flat_usd: number | string | null;
  applies_up_to_value_usd: number | string | null;
  effective_from: string;
  source_label: string;
  source_url: string;
};

export type HtsLineForEstimate = {
  hts_code: string;
  general_rate: string | null;
  special_rate: string | null;
  other_rate: string | null;
};

export type ReleaseInfo = {
  name: string;
  title: string | null;
  release_start_date: string | null;
};

export type EstimateInput = {
  line: HtsLineForEstimate;
  release: ReleaseInfo;
  originIsColumn2: boolean;
  shipmentMode: ShipmentMode;
  customsValueUsd: Rational;
  // In the rate's unit; only used for per-unit rates.
  quantity: Rational | null;
  // The fee rows in force on the estimate's date.
  fees: FeeRow[];
};

export type EstimateLine = {
  kind: "duty" | "additional" | "fee";
  // "general" / "column2" for the base duty, the fee code for fees, the
  // program key for additional duties.
  code: string;
  label: string;
  rateText: string;
  amountUsd: number;
  detail: string | null;
  sourceLabel: string;
  sourceUrl: string;
  effectiveFrom: string | null;
  // Additional duties only.
  heading?: string;
  effectiveTo?: string | null;
  legalStatus?: string;
  sourceCheckedOn?: string;
  // Conditional exemptions ("may be exempt if …"), not applied.
  notes?: string[];
};

export type EstimateCalculation =
  | {
      ok: true;
      rateColumn: "general" | "column2";
      rateText: string;
      quantityUsed: { value: number; unit: string; unitLabel: string } | null;
      baseDutyUsd: number;
      feesUsd: number;
      totalUsd: number;
      lines: EstimateLine[];
    }
  | { ok: false; reason: "no_rate" }
  | { ok: false; reason: "unsupported_rate"; rateText: string }
  | { ok: false; reason: "quantity_required"; unitLabel: string }
  | { ok: false; reason: "missing_fee"; feeCode: FeeCode };

export const HTS_SOURCE_URL = "https://hts.usitc.gov/";

const HUNDRED = fromInteger(100);

function usd(value: Rational): string {
  return formatCurrency(centsToNumber(toCents(value)), "USD");
}

function usdText(value: number | string): string {
  return formatCurrency(Number(value), "USD");
}

function pctText(value: Rational, places = 4): string {
  // Trim trailing zeros: 0.346400 → 0.3464, 6.0000 → 6.
  return `${toFixed(value, places).replace(/\.?0+$/, "")}%`;
}

// Local value × rate, rounded to the cent: the customs value every line uses.
export function customsValueInUsd(original: string, rateToUsd: string): Rational {
  return centsToRational(toCents(mul(parseDecimal(original), parseDecimal(rateToUsd))));
}

export function releaseSourceLabel(release: ReleaseInfo): string {
  return `HTSUS ${release.title ?? release.name} (USITC)`;
}

function baseDuty(input: EstimateInput):
  | { ok: true; line: EstimateLine; rateColumn: "general" | "column2"; rateText: string;
      cents: bigint; quantityUsed: { value: number; unit: string; unitLabel: string } | null }
  | Extract<EstimateCalculation, { ok: false }> {
  const rateColumn = input.originIsColumn2 ? "column2" : "general";
  const rateText = input.originIsColumn2 ? input.line.other_rate : input.line.general_rate;
  if (!rateText) return { ok: false, reason: "no_rate" };

  const parsed = parseRateText(rateText);
  if (parsed.kind === "unsupported") return { ok: false, reason: "unsupported_rate", rateText };

  let amount = ZERO;
  const details: string[] = [];
  let quantityUsed: { value: number; unit: string; unitLabel: string } | null = null;

  if (parsed.kind === "rate") {
    if (parsed.adValoremPct) {
      amount = add(amount, div(mul(input.customsValueUsd, parsed.adValoremPct), HUNDRED));
      details.push(`${pctText(parsed.adValoremPct)} of ${usd(input.customsValueUsd)}`);
    }
    if (parsed.specific) {
      if (!input.quantity) {
        return { ok: false, reason: "quantity_required", unitLabel: parsed.specific.unitLabel };
      }
      const specificUsd = div(mul(input.quantity, parsed.specific.centsPerUnit), HUNDRED);
      amount = add(amount, specificUsd);
      const quantityText = toFixed(input.quantity, 4).replace(/\.?0+$/, "");
      details.push(`${Number(quantityText).toLocaleString("en-US")} ${parsed.specific.unitLabel}`);
      quantityUsed = {
        value: Number(quantityText),
        unit: parsed.specific.unit,
        unitLabel: parsed.specific.unitLabel,
      };
      const equivalent = div(mul(amount, HUNDRED), input.customsValueUsd);
      details.push(`about ${pctText(equivalent, 2)} of the customs value`);
    }
  }

  const cents = toCents(amount);
  const release = input.release;
  return {
    ok: true,
    rateColumn,
    rateText,
    cents,
    quantityUsed,
    line: {
      kind: "duty",
      code: rateColumn,
      label: rateColumn === "column2" ? "Base duty (column 2 rate)" : "Base duty (general rate)",
      rateText,
      amountUsd: centsToNumber(cents),
      detail: details.length > 0 ? details.join("; ") : null,
      sourceLabel: releaseSourceLabel(release),
      sourceUrl: HTS_SOURCE_URL,
      effectiveFrom: release.release_start_date,
    },
  };
}

function feeLine(row: FeeRow, cents: bigint, rateText: string, detail: string | null): EstimateLine {
  return {
    kind: "fee",
    code: row.fee_code,
    label: row.label,
    rateText,
    amountUsd: centsToNumber(cents),
    detail,
    sourceLabel: row.source_label,
    sourceUrl: row.source_url,
    effectiveFrom: row.effective_from,
  };
}

function mpf(input: EstimateInput): { line: EstimateLine; cents: bigint } | FeeCode {
  const value = input.customsValueUsd;
  const informal = input.fees.find((f) => f.fee_code === "mpf_informal");
  if (
    informal &&
    informal.flat_usd != null &&
    informal.applies_up_to_value_usd != null &&
    compare(value, parseDecimal(informal.applies_up_to_value_usd)) <= 0
  ) {
    const cents = toCents(parseDecimal(informal.flat_usd));
    return {
      cents,
      line: feeLine(
        informal,
        cents,
        `${usdText(informal.flat_usd)} flat`,
        `Assumes an informal entry (value up to ${usdText(informal.applies_up_to_value_usd)})`,
      ),
    };
  }

  const formal = input.fees.find((f) => f.fee_code === "mpf_formal");
  if (!formal || formal.rate_pct == null || formal.min_usd == null || formal.max_usd == null) {
    return "mpf_formal";
  }
  const rate = parseDecimal(formal.rate_pct);
  const min = toCents(parseDecimal(formal.min_usd));
  const max = toCents(parseDecimal(formal.max_usd));
  const calculated = toCents(div(mul(value, rate), HUNDRED));
  const cents = calculated < min ? min : calculated > max ? max : calculated;
  const limit = cents === min && calculated < min ? "Minimum applied" : cents === max && calculated > max ? "Maximum applied" : null;
  return {
    cents,
    line: feeLine(
      formal,
      cents,
      `${pctText(rate)} (min ${usdText(formal.min_usd)}, max ${usdText(formal.max_usd)})`,
      [`${pctText(rate)} of ${usd(value)}`, limit].filter(Boolean).join("; "),
    ),
  };
}

function hmf(input: EstimateInput): { line: EstimateLine; cents: bigint } | FeeCode | null {
  if (input.shipmentMode !== "Sea") return null;
  const row = input.fees.find((f) => f.fee_code === "hmf");
  if (!row || row.rate_pct == null) return "hmf";
  const rate = parseDecimal(row.rate_pct);
  const cents = toCents(div(mul(input.customsValueUsd, rate), HUNDRED));
  return { cents, line: feeLine(row, cents, pctText(rate), `${pctText(rate)} of ${usd(input.customsValueUsd)}`) };
}

export function calculateEstimate(input: EstimateInput): EstimateCalculation {
  const base = baseDuty(input);
  if (!base.ok) return base;

  const mpfResult = mpf(input);
  if (typeof mpfResult === "string") return { ok: false, reason: "missing_fee", feeCode: mpfResult };
  const hmfResult = hmf(input);
  if (typeof hmfResult === "string") return { ok: false, reason: "missing_fee", feeCode: hmfResult };

  const fees = [mpfResult, ...(hmfResult ? [hmfResult] : [])];
  const feesCents = fees.reduce((sum, f) => sum + f.cents, BigInt(0));
  return {
    ok: true,
    rateColumn: base.rateColumn,
    rateText: base.rateText,
    quantityUsed: base.quantityUsed,
    baseDutyUsd: centsToNumber(base.cents),
    feesUsd: centsToNumber(feesCents),
    totalUsd: centsToNumber(base.cents + feesCents),
    lines: [base.line, ...fees.map((f) => f.line)],
  };
}

import type { EstimateLine } from "@/lib/tariff/calculate";
import type { EntryType } from "@/lib/tariff/customs-fees";
import type { OldestReview } from "@/lib/tariff/effective-rate";
import type { ProgramWarning } from "@/lib/tariff/programs";
import type { LineErrorCode } from "./duty-request";
import type { ScenarioComparison } from "./scenario-comparison";
import type { ScenarioField, SkuField } from "./scenario-inputs";
import type { ScenarioStatus, SkuTotals } from "./scenario-totals";

// What the result panel, the comparison and the CSV read from a result: only
// these fields. The live WorkspaceResult (server-compute.ts) fits it as is,
// and so does a locked version restored from its stored snapshot
// (snapshot-schema.ts), so both are shown by the same view functions.

export type ViewDutyUnit = { token: string; label: string };

export type ViewDuty = {
  // The HTS line the duties were calculated on.
  htsCode: string;
  dutiesCents: bigint;
  dutiesUsd: number;
  effectiveDutyRate: string | null;
  incomplete: boolean;
  lines: EstimateLine[];
  warnings: ProgramWarning[];
  oldestReview: OldestReview | null;
};

export type ViewSkuStatus =
  | { status: "ok"; skuLineId: string; duty: ViewDuty }
  | { status: "inputs_missing"; skuLineId: string; missing: SkuField[]; dutyQuantityUnit: ViewDutyUnit | null; duty: ViewDuty | null }
  | { status: "duty_error"; skuLineId: string; code: LineErrorCode; message: string; unit: ViewDutyUnit | null; missing: SkuField[] };

export type ViewFeeCharge = { line: EstimateLine; cents: bigint };

export type ViewTotals = {
  skus: SkuTotals[];
  units: bigint;
  totalCents: bigint;
  perUnitCents: bigint;
  status: ScenarioStatus;
  entryFees: {
    entryType: EntryType;
    entryTypeSource: "chosen" | "automatic";
    mpf: ViewFeeCharge;
    hmf: ViewFeeCharge | null;
    warnings: { text: string }[];
  };
};

type Base = { scenarioId: string; label: string; isBaseline: boolean; skus: ViewSkuStatus[] };
export type ViewOutcome =
  | (Base & { state: "complete"; totals: ViewTotals })
  | (Base & { state: "incomplete"; missing: ScenarioField[] })
  | (Base & { state: "error"; message: string });

export type ViewResult =
  | {
      state: "ready";
      calculatedOn: string;
      entryDate: string;
      scenarios: ViewOutcome[];
      comparison: ScenarioComparison | null;
      comparisonNote: string | null;
    }
  | { state: "entry_date_out_of_range"; calculatedOn: string; entryDate: string; bounds: { min: string; max: string }; message: string }
  | { state: "no_sku_lines"; calculatedOn: string; entryDate: string }
  | { state: "duties_unavailable"; calculatedOn: string; entryDate: string; message: string };

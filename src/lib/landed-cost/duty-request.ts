import { isOriginCountry } from "@/lib/tariff/countries";
import { checkEntryDate } from "@/lib/tariff/entry-date";
import { normalizeHtsCode } from "@/lib/tariff/hts-code";
import { positiveDecimal } from "@/lib/tariff/parse-estimate-form";
import { unitLabelOf } from "@/lib/tariff/rate-text";
import type { SkuDuty } from "./sku-duty";

// A batch duty request (many SKU lines × origins, one entry date) and its
// result types, and the request's validation. Values are USD; amounts and
// quantities follow the Tariff Calculator's bounds. Pure.

export const MAX_DUTY_LINES = 500;
export const MAX_DISTINCT_HTS = 100;
export const MAX_DISTINCT_ORIGINS = 5;
const LINE_ID_MAX = 100;

export type DutyLineRequest = {
  // The caller's id for the line (e.g. SKU × origin); unique in the request.
  lineId: string;
  htsCode: string;
  originCountry: string;
  enteredValueUsd: string;
  // Only for per-unit rates, in the rate's own unit (e.g. net kg, dozen).
  dutyQuantity?: string | null;
  dutyQuantityUnit?: string | null;
};

export type DutyRequest = { entryDate: string; lines: DutyLineRequest[] };

export type LineErrorCode =
  | "invalid_line_id"
  | "duplicate_line_id"
  | "invalid_hts"
  | "invalid_origin"
  | "invalid_value"
  | "invalid_quantity"
  | "hts_not_found"
  | "hts_ambiguous"
  | "no_rate"
  | "unsupported_rate"
  | "needs_quantity";

export type CallErrorCode = "no_lines" | "too_many_lines" | "invalid_entry_date" | "no_release" | "load_failed";

export type LineError = {
  ok: false;
  lineId: string;
  code: LineErrorCode;
  message: string;
  // needs_quantity: the unit the rate is charged in.
  unit?: { token: string; label: string };
};

export type LineDutyResult = { ok: true; lineId: string; duty: SkuDuty } | LineError;

export type CallError = { ok: false; code: CallErrorCode; message: string };

export type DutyBatchResult = { ok: true; entryDate: string; lines: LineDutyResult[] } | CallError;

export type ValidLine = {
  lineId: string;
  digits: string;
  originCountry: string;
  enteredValueUsd: string;
  quantity: { value: string; unit: string } | null;
};

export type ParsedRequest =
  | { ok: true; entryDate: string; items: (ValidLine | LineError)[] }
  | CallError;

const fail = (lineId: string, code: LineErrorCode, message: string): LineError => ({ ok: false, lineId, code, message });

function parseLine(line: DutyLineRequest): ValidLine | LineError {
  const lineId = typeof line.lineId === "string" ? line.lineId.trim() : "";
  if (lineId === "" || lineId.length > LINE_ID_MAX) {
    return fail(lineId, "invalid_line_id", `Each line needs an id of 1 to ${LINE_ID_MAX} characters.`);
  }
  const code = normalizeHtsCode(line.htsCode ?? "");
  if (!code.ok) return fail(lineId, "invalid_hts", code.error);
  const origin = (line.originCountry ?? "").trim().toUpperCase();
  if (!isOriginCountry(origin)) return fail(lineId, "invalid_origin", "Choose the country of origin.");
  const value = (line.enteredValueUsd ?? "").trim().replace(/,/g, "");
  // numeric(16,2), as the calculator's customs value.
  if (!positiveDecimal(value, 2, 1e14)) {
    return fail(lineId, "invalid_value", "Enter the entered value in USD as a positive amount, e.g. 600.00.");
  }

  const quantityText = (line.dutyQuantity ?? "").trim().replace(/,/g, "");
  const unit = (line.dutyQuantityUnit ?? "").trim();
  let quantity: ValidLine["quantity"] = null;
  if (quantityText !== "" || unit !== "") {
    // numeric(16,4), and a unit the rate parser knows.
    if (!positiveDecimal(quantityText, 4, 1e12) || unitLabelOf(unit) == null) {
      return fail(lineId, "invalid_quantity", "Enter the duty quantity as a positive number with its unit, e.g. 120 kg.");
    }
    quantity = { value: quantityText, unit };
  }
  return { lineId, digits: code.digits, originCountry: origin, enteredValueUsd: value, quantity };
}

export function parseDutyRequest(request: DutyRequest, calculatedOn: string): ParsedRequest {
  const lines = Array.isArray(request.lines) ? request.lines : [];
  if (lines.length === 0) return { ok: false, code: "no_lines", message: "Add at least one SKU line." };
  if (lines.length > MAX_DUTY_LINES) {
    return { ok: false, code: "too_many_lines", message: `Estimate at most ${MAX_DUTY_LINES} lines at a time.` };
  }
  const entry = checkEntryDate(request.entryDate ?? "", calculatedOn);
  if (!entry.ok) return { ok: false, code: "invalid_entry_date", message: entry.error };

  const parsed = lines.map(parseLine);
  // An id used twice fails every line that has it: which one was meant can't be told.
  const seen = new Map<string, number>();
  for (const item of parsed) if (item.lineId !== "") seen.set(item.lineId, (seen.get(item.lineId) ?? 0) + 1);
  const items = parsed.map((item) =>
    item.lineId !== "" && seen.get(item.lineId)! > 1
      ? fail(item.lineId, "duplicate_line_id", `The line id "${item.lineId}" is used more than once.`)
      : item,
  );

  const valid = items.filter((i): i is ValidLine => !("ok" in i));
  if (new Set(valid.map((v) => v.digits)).size > MAX_DISTINCT_HTS) {
    return { ok: false, code: "too_many_lines", message: `Use at most ${MAX_DISTINCT_HTS} different HTS codes at a time.` };
  }
  if (new Set(valid.map((v) => v.originCountry)).size > MAX_DISTINCT_ORIGINS) {
    return { ok: false, code: "too_many_lines", message: `Compare at most ${MAX_DISTINCT_ORIGINS} countries of origin at a time.` };
  }
  return { ok: true, entryDate: entry.date, items };
}

import { describeRowRate, inForceOn, type ReviewStatus } from "@/lib/tariff/additional-duties";
import type { ChecklistHint, ChecklistItem } from "./checklist";

// Live hints, built only from rows the app already holds. A hint that can't be
// built from data (no such program, no such row) is simply absent.

export type ProgramStatusRow = { program_key: string; review_status: ReviewStatus; row_count: number };
export type DutyRateRow = {
  chapter99_heading: string;
  rate_type: "add" | "minimum_total" | "exempt" | "unconfirmed";
  rate_pct: number | string | null;
  effective_from: string;
  effective_to: string | null;
};

export type HintData = { programs: ProgramStatusRow[]; dutyRows: DutyRateRow[] };

// The row for a heading: the one in force today, else none (a row that is
// ended or not yet started isn't what the app currently has).
export function currentRateHint(heading: string, rows: DutyRateRow[], today: string): ChecklistHint | null {
  const row = rows.find((r) => r.chapter99_heading === heading && inForceOn(r, today));
  if (!row) return null;
  const rate = describeRowRate({ rate_type: row.rate_type, rate_pct: row.rate_pct == null ? null : Number(row.rate_pct) });
  return { kind: "rate", text: `${rate}${row.rate_type === "unconfirmed" ? "" : ", confirmed"}` };
}

export function buildHint(
  item: Pick<ChecklistItem, "hint_kind" | "hint_ref">,
  data: HintData,
  today: string,
): ChecklistHint | null {
  if (!item.hint_kind || !item.hint_ref) return null;
  if (item.hint_kind === "duty_row_rate") return currentRateHint(item.hint_ref, data.dutyRows, today);
  const program = data.programs.find((p) => p.program_key === item.hint_ref);
  if (!program) return null;
  return item.hint_kind === "program_review"
    ? { kind: "review", status: program.review_status }
    : { kind: "rows", count: program.row_count };
}

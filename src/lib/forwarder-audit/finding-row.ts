import type { Cell } from "./calc-semantics";
import type { FindingRow, FindingType } from "./types";

// One row of the workbook's findings table. Every check is wrapped in
// IFERROR(...,0) there, so a check that can't be evaluated is simply off.
// Texts are only worked out for an active row; an inactive row is all "".

export type FindingTexts = { charge: Cell; issue: Cell; explanation: Cell; action: Cell; amount?: Cell };

export function findingRow(key: string, row: number, type: FindingType, isActive: () => boolean, texts: () => FindingTexts): FindingRow {
  let active: 0 | 1 = 0;
  try {
    active = isActive() ? 1 : 0;
  } catch {
    active = 0;
  }
  const order = type === "Error" ? 1 : type === "Question" ? 2 : 3;
  const t: FindingTexts = active ? texts() : { charge: "", issue: "", explanation: "", action: "" };
  return {
    key,
    row,
    active,
    type,
    order,
    charge: t.charge,
    issue: t.issue,
    explanation: t.explanation,
    action: t.action,
    amount: t.amount ?? "",
    rank: active ? order * 1000 + row : "",
    questionRank: active && type === "Question" ? row : "",
  };
}


import { cat, eq, isNum, sub, type Cell, type Input } from "./calc-semantics";
import type { AuditSettings } from "./lists";
import { textPercent, textQty3 } from "./text-format";
import type { AuditInputs } from "./types";

// Section 1's cargo basis (Audit rows 35-39) and the measures the per-unit
// bases use (Checks AF30-AF33).

export type CargoMeasures = {
  revenueTonnes: Cell; // AF30: greater of CBM and tonnes ("" without CBM)
  chargeableKg: Cell; // AF31: air uses the volumetric weight when higher
  divisorUsed: number; // AF32
  cbm: number; // AF33: 0 without a volume (TECH_DEBT B3)
};

export function cargoMeasures(inputs: AuditInputs, settings: AuditSettings): CargoMeasures {
  const { grossWeightKg: kg, volumeCbm: cbm } = inputs.shipment;
  const divisorUsed = inputs.quotation.airDivisor ?? settings.airDivisor;
  const revenueTonnes: Cell = isNum(cbm) && isNum(kg) ? Math.max(cbm, kg / 1000) : isNum(cbm) ? cbm : "";
  let chargeableKg: Cell = "";
  if (isNum(kg)) {
    if (!eq(text(inputs.quotation.mode), "Air")) chargeableKg = kg;
    else if (!isNum(cbm)) chargeableKg = Math.max(kg, 0);
    else if (divisorUsed === 0) chargeableKg = { error: "#DIV/0!" };
    else chargeableKg = Math.max(kg, (cbm * 1000000) / divisorUsed);
  }
  return { revenueTonnes, chargeableKg, divisorUsed, cbm: isNum(cbm) ? cbm : 0 };
}

// "" text is an empty cell.
export const text = (s: string): Input => (s === "" ? null : s);

export type CargoBasisRow = {
  ciPl: Cell; // C
  quoted: Input; // D
  difference: Cell; // E
  differencePercent: Cell; // F
  check: string; // H
};

function difference(ci: Cell, quoted: Input): { difference: Cell; differencePercent: Cell } {
  if (ci === "" || quoted === null || !isNum(ci)) return { difference: "", differencePercent: "" };
  const d = sub(quoted as number, ci);
  return { difference: d, differencePercent: ci === 0 ? "" : d / ci };
}

function exactRow(ci: Cell, quoted: Input): CargoBasisRow {
  const check =
    quoted === null ? "Not stated in quotation" : ci === "" ? "CI/PL value missing" : eq(quoted, ci) ? "Matches" : "ERROR - does not match the CI/PL";
  return { ciPl: ci, quoted, ...difference(ci, quoted), check };
}

function reviewRow(ci: Cell, quoted: Input, accept: string): CargoBasisRow {
  const diff = difference(ci, quoted);
  let check: string;
  if (quoted === null) check = "Not stated in quotation";
  else if (ci === "") check = "CI/PL value missing";
  else if (eq(quoted, ci)) check = "Matches";
  else if (eq(text(accept), "Yes")) check = "Difference accepted by auditor";
  else check = `Review - differs by ${textQty3(diff.difference)} (${textPercent(diff.differencePercent)})`;
  return { ciPl: ci, quoted, ...diff, check };
}

function packagesRow(inputs: AuditInputs): CargoBasisRow {
  const { cartons, pallets } = inputs.shipment;
  const quoted = inputs.quotedCargo.packages;
  const ci = cartons === null ? "" : `${cat(cartons)} ctns / ${pallets === null ? "0" : cat(pallets)} plts`;
  let check: string;
  if (quoted === null) check = "Not stated in quotation";
  else if (cartons === null && pallets === null) check = "CI/PL value missing";
  else if (eq(quoted, cartons)) check = "Matches cartons";
  else if (isNum(pallets) && eq(quoted, pallets)) check = "Matches pallets";
  else check = "ERROR - matches neither cartons nor pallets";
  return { ciPl: ci, quoted, difference: "", differencePercent: "", check };
}

const orBlank = (v: number | null): Cell => (v === null ? "" : v);

export type CargoBasis = {
  pieces: CargoBasisRow;
  packages: CargoBasisRow;
  grossWeight: CargoBasisRow;
  volume: CargoBasisRow;
};

export function cargoBasis(inputs: AuditInputs): CargoBasis {
  const { shipment: s, quotedCargo: q } = inputs;
  return {
    pieces: exactRow(orBlank(s.pieces), q.pieces),
    packages: packagesRow(inputs),
    grossWeight: reviewRow(orBlank(s.grossWeightKg), q.grossWeightKg, q.acceptWeightDifference),
    volume: reviewRow(orBlank(s.volumeCbm), q.volumeCbm, q.acceptVolumeDifference),
  };
}

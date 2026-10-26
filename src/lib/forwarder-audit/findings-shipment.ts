import { cat, cmpNum, eq, isNum, sub, type Cell, type Input } from "./calc-semantics";
import { text, type CargoBasis } from "./cargo";
import { findingRow } from "./finding-row";
import type { AuditSettings } from "./lists";
import { textDate, textMoney, textPercent, textQty2, textQty3, dateSerial } from "./text-format";
import type { AuditInputs, CoverageResult, FindingRow } from "./types";

// The shipment-level checks (Checks rows 70-98), in sheet order.

export type LineFigures = {
  linesEntered: number; // AF7
  pricedLines: number; // AF8
  fxMissing: number; // AF9
  knownFirm: number; // AF10
  estimates: number; // AF11
  estimateLines: number; // AF12
  firmPreTax: number; // AF28
  notStarted: 0 | 1; // AF34
  fumigationLines: number; // COUNTIF(names, "*fumig*")
  fumigationAmount: number; // SUMIFS(totals, names, "*fumig*")
};

type Ctx = { inputs: AuditInputs; cargo: CargoBasis; coverage: CoverageResult[]; f: LineFigures; s: AuditSettings };

const is = (v: Input | Cell, s: string) => eq(v, s);
const blank = (v: Input) => v === null || v === "";

function validity(ctx: Ctx, rows: [number, number, number], keys: [string, string, string], label: string, used: boolean, until: number | null): FindingRow[] {
  const { inputs: i, s } = ctx;
  const audit = dateSerial(i.shipment.auditDate);
  const ready = dateSerial(i.shipment.cargoReadyDate);
  const where = label.toLowerCase();
  return [
    findingRow(keys[0], rows[0], "Question", () => used && until === null, () => ({
      charge: `${label} charges validity`,
      issue: "Not Confirmed",
      explanation: `The quotation does not state how long the ${where} charges are valid; the freight validity date is not applied to them.`,
      action: `Ask the forwarder to confirm the validity of the ${where} charges.`,
    })),
    findingRow(keys[1], rows[1], "Question", () => used && until !== null && ((audit !== null && until < audit) || (ready !== null && until < ready)), () => ({
      charge: `${label} charges validity`,
      issue: `Expired / expires on ${textDate(until)}`,
      explanation: `The ${where} charges are no longer valid for this shipment date.`,
      action: "Request revalidated charges before the client proceeds.",
    })),
    findingRow(keys[2], rows[2], "Risk", () => used && until !== null && audit !== null && expiresSoon(until, audit, ready, s), () => ({
      charge: `${label} charges validity`,
      issue: `Expire on ${textDate(until)}`,
      explanation: `Only ${cat(sub(until!, audit!))} day(s) after the audit date.`,
      action: "Book before expiry or ask the forwarder to extend validity.",
    })),
  ];
}

function expiresSoon(until: number, audit: number, ready: number | null, s: AuditSettings): boolean {
  return until >= audit && cmpNum(sub(until, audit), s.validityWarningDays) <= 0 && !(ready !== null && until < ready);
}

function notStatedList(q: AuditInputs["quotedCargo"]): string {
  const list =
    (q.pieces === null ? "pieces, " : "") +
    (q.packages === null ? "packages, " : "") +
    (q.grossWeightKg === null ? "weight, " : "") +
    (q.volumeCbm === null ? "volume, " : "");
  return list.slice(0, Math.max(0, list.length - 2));
}

function differs(row: CargoBasis["grossWeight"], accept: string, s: AuditSettings): boolean {
  if (!isNum(row.differencePercent)) return false;
  return row.difference !== 0 && !is(text(accept), "Yes") && cmpNum(Math.abs(row.differencePercent) * 100, s.reviewThresholdPercent) > 0;
}

export function shipmentFindings(ctx: Ctx): FindingRow[] {
  const { inputs: i, cargo, coverage, f, s } = ctx;
  const sh = i.shipment;
  const q = i.quotation;
  const qc = i.quotedCargo;
  const valid = dateSerial(q.freightValidUntil);
  const audit = dateSerial(sh.auditDate);
  const ready = dateSerial(sh.cargoReadyDate);
  const fcl = is(text(q.mode), "Sea FCL");
  const priced = (...idx: number[]) => idx.reduce((n, k) => n + coverage[k].pricedLines, 0) > 0;
  const tol = s.roundingTolerance;
  return [
    findingRow("CI", 70, "Question", () => is(text(sh.commercialInvoiceReceived), "No"), () => ({
      charge: "Commercial invoice",
      issue: "Not provided",
      explanation: "The quotation cannot be checked against the shipment without the commercial invoice.",
      action: "Obtain the commercial invoice from the client.",
    })),
    findingRow("PL", 71, "Question", () => is(text(sh.packingListReceived), "No"), () => ({
      charge: "Packing list",
      issue: "Not provided",
      explanation: "Weights, volumes and packages cannot be checked without the packing list.",
      action: "Obtain the packing list from the client.",
    })),
    findingRow("ITEM", 72, "Question", () => is(text(sh.quotationItemised), "No"), () => ({
      charge: "Whole quotation",
      issue: "Not itemised",
      explanation: "A lump-sum quotation cannot be audited charge by charge.",
      action: "Ask the forwarder for a line-by-line breakdown with units and quantities.",
    })),
    findingRow("NOPRICE", 73, "Question", () => f.linesEntered > 0 && f.pricedLines === 0, () => ({
      charge: "Charge lines",
      issue: "No line has a usable rate",
      explanation: "None of the entered lines can be calculated.",
      action: "Check that rates, bases and statuses are entered; ask the forwarder for unit rates.",
    })),
    findingRow("VMISS", 74, "Question", () => f.notStarted === 0 && valid === null, () => ({
      charge: "Freight validity",
      issue: "Validity date not stated",
      explanation: "Without a validity date the client cannot tell whether the rates still apply.",
      action: "Ask the forwarder for the validity date of all rates, including local charges.",
    })),
    findingRow("VEXP", 75, "Question", () => valid !== null && ((audit !== null && valid < audit) || (ready !== null && valid < ready)), () => ({
      charge: "Freight validity",
      issue: `Freight rates expired / expire on ${textDate(valid)}`,
      explanation: "The rates are no longer valid for this shipment date.",
      action: "Request revalidated rates before the client proceeds.",
    })),
    findingRow("VSOON", 76, "Risk", () => valid !== null && audit !== null && expiresSoon(valid, audit, ready, s), () => ({
      charge: "Freight validity",
      issue: `Freight rates expire on ${textDate(valid)}`,
      explanation: `Only ${cat(sub(valid!, audit!))} day(s) after the audit date.`,
      action: "Book before expiry or ask the forwarder to extend validity.",
    })),
    findingRow("TRANSIT", 77, "Question", () => f.notStarted === 0 && blank(text(q.transitTime)), () => ({
      charge: "Transit time",
      issue: "Not stated",
      explanation: "The client cannot plan delivery without a transit time.",
      action: "Ask the forwarder for the transit time and routing.",
    })),
    findingRow("FREE", 78, "Question", () => fcl && blank(text(q.freeTimeDays)), () => ({
      charge: "Demurrage / detention",
      issue: "Free time not stated",
      explanation: "Without free days, container demurrage and detention costs cannot be estimated.",
      action: "Ask the forwarder how many free days apply at destination.",
    })),
    findingRow("CONT", 79, "Question", () => fcl && !isNum(q.containers), () => ({
      charge: "Containers",
      issue: "Container quantity not entered",
      explanation: "Per-container charges assume 1 container until the quantity is entered.",
      action: "Enter the quoted container quantity and type.",
    })),
    findingRow("LOAD", 80, "Question", () => fcl && !is(text(q.loadPlanConfirmed), "Yes"), () => ({
      charge: `Container ${cat(q.containers)} x ${cat(text(q.containerType))}`,
      issue: "Load plan not confirmed",
      explanation:
        `Cargo: ${cat(sh.cartons)} cartons, ${cat(sh.pallets)} pallets` +
        (sh.packageDimensions !== "" ? `; ${sh.packageDimensions}` : "") +
        `; stackable: ${sh.stackable === "" ? "not stated" : sh.stackable}. Fit cannot be decided from CBM alone.`,
      action: "Ask the forwarder to confirm the load plan; if a different container is needed, request a revised quotation.",
    })),
    findingRow("ROUTE", 81, "Question", () => is(text(q.routeMatchesRequest), "No") || is(text(q.routeMatchesRequest), "Partly"), () => ({
      charge: "Route",
      issue: "Quoted route differs from the request",
      explanation: `Quoted: ${q.routing} / request: ${sh.portOfLoading} to ${sh.portOfDischarge}`,
      action: "Ask the forwarder to quote the requested route or explain the change and its cost effect.",
    })),
    findingRow("SPECIAL", 82, "Question", () => is(text(sh.specialCargo), "Yes"), () => ({
      charge: "Special cargo",
      issue: "Special handling may not be covered",
      explanation: "The shipment is marked as special cargo; standard rates usually exclude it.",
      action: "Ask the forwarder to confirm the quotation covers the special cargo requirements.",
    })),
    findingRow("VOL", 83, "Question", () => is(text(sh.plVolumeCoversAll), "No") || is(text(sh.plVolumeCoversAll), "Unknown"), () => ({
      charge: "Cargo basis - volume",
      issue: "Packing-list volume may not cover all cargo",
      explanation: `Stated ${textQty3(sh.volumeCbm)} CBM; ${sh.packageDimensions !== "" ? sh.packageDimensions : "see packing list"}`,
      action: "Ask the shipper to confirm the total shipped volume and dimensions; per-CBM charges and the load plan must use the confirmed figure.",
    })),
    ...validity(ctx, [84, 85, 86], ["VOriginNC", "VOriginEXP", "VOriginSOON"], "Origin", priced(0, 1), dateSerial(q.originChargesValidUntil)),
    ...validity(ctx, [87, 88, 89], ["VDestinationNC", "VDestinationEXP", "VDestinationSOON"], "Destination", priced(3, 4, 5), dateSerial(q.destinationChargesValidUntil)),
    findingRow("PCS", 90, "Error", () => is(cargo.pieces.check.slice(0, 5), "ERROR"), () => ({
      charge: "Cargo basis - pieces",
      issue: "Quoted pieces do not match the CI/PL",
      explanation: `Quoted ${cat(qc.pieces)} vs CI/PL ${cat(cargo.pieces.ciPl)}`,
      action: "Ask the forwarder to correct the quotation to the documented quantity.",
    })),
    findingRow("PKG", 91, "Error", () => is(cargo.packages.check.slice(0, 5), "ERROR"), () => ({
      charge: "Cargo basis - packages",
      issue: "Quoted packages do not match the CI/PL",
      explanation: `Quoted ${cat(qc.packages)} vs CI/PL ${cat(cargo.packages.ciPl)}`,
      action: "Ask the forwarder to correct the quotation to the documented cartons or pallets.",
    })),
    findingRow("NOTSTATED", 92, "Question", () => f.notStarted === 0 && !is(text(sh.quotationItemised), "No") && notStatedList(qc) !== "", () => ({
      charge: "Cargo basis",
      issue: "Not stated in the quotation",
      explanation: `The quotation does not state: ${notStatedList(qc)}.`,
      action:
        `Ask the forwarder to confirm the quotation is based on ${cat(sh.pieces)} pcs, ${cat(sh.cartons)} cartons / ${cat(sh.pallets)} pallets, ` +
        `${textQty2(sh.grossWeightKg)} kg, ${textQty3(sh.volumeCbm)} CBM.`,
    })),
    findingRow("GW", 93, "Question", () => differs(cargo.grossWeight, qc.acceptWeightDifference, s), () => ({
      charge: "Cargo basis - weight",
      issue: "Quoted weight differs from the packing list",
      explanation: `Quoted ${textQty2(qc.grossWeightKg)} kg vs PL ${textQty2(cargo.grossWeight.ciPl)} kg (${textPercent(cargo.grossWeight.differencePercent)})`,
      action: "Ask the forwarder to re-base the charges on the packing-list weight, or accept the difference with a note.",
    })),
    findingRow("CBM", 94, "Question", () => differs(cargo.volume, qc.acceptVolumeDifference, s), () => ({
      charge: "Cargo basis - volume",
      issue: "Quoted volume differs from the packing list",
      explanation: `Quoted ${textQty3(qc.volumeCbm)} CBM vs PL ${textQty3(cargo.volume.ciPl)} CBM (${textPercent(cargo.volume.differencePercent)})`,
      action: "Ask the forwarder to re-base volume charges on the packing-list CBM, or accept the difference with a note.",
    })),
    findingRow("FX", 95, "Risk", () => f.fxMissing > 0, () => ({
      charge: "Currency",
      issue: `Exchange rate missing for ${f.fxMissing} line(s)`,
      explanation: "Lines in another currency are left out of the totals until a rate is entered.",
      action: "Enter the exchange rate in Quotation Information (other currency rows).",
    })),
    findingRow("TOTAL", 96, "Error", () => isNum(q.statedTotal) && cmpNum(Math.abs(sub(q.statedTotal, f.firmPreTax)), tol) > 0 && cmpNum(Math.abs(sub(q.statedTotal, f.knownFirm)), tol) > 0, () => ({
      charge: "Quotation total",
      issue: "Stated total does not equal the sum of the lines",
      explanation: `Stated ${textMoney(q.statedTotal)} vs firm lines ${textMoney(f.firmPreTax)} before tax / ${textMoney(f.knownFirm)} incl. tax`,
      action: "Ask the forwarder to correct the total or show the missing lines.",
    })),
    findingRow("EST", 97, "Risk", () => f.estimateLines > 0, () => ({
      charge: "Estimated charges",
      issue: `${f.estimateLines} line(s) are estimates only`,
      explanation: "Final amounts may differ from the estimate.",
      action: "Ask the forwarder to confirm firm amounts or the basis of the estimate.",
      amount: f.estimates,
    })),
    findingRow("WOOD", 98, "Risk", () => is(text(sh.woodPackaging), "Yes") && !is(text(q.mode), "Air"), () => ({
      charge: "Fumigation",
      issue: f.fumigationLines === 0 ? "Wood packaging: fumigation not quoted" : "Likely to apply (wood packaging)",
      explanation: "Wood packaging may need fumigation or ISPM 15 treatment at origin.",
      action:
        f.fumigationLines === 0
          ? "Ask whether fumigation is needed and its cost, or confirm the pallets are ISPM 15 treated."
          : "Budget for the fumigation charge, or confirm the pallets are ISPM 15 treated.",
      amount: f.fumigationAmount === 0 ? "" : f.fumigationAmount,
    })),
  ];
}

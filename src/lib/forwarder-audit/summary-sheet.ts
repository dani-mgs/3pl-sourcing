import { cat, eq, ref, type Cell } from "./calc-semantics";
import { text } from "./cargo";
import { dateSerial, textDate, textQty2, textQty3 } from "./text-format";
import type { AuditFigures } from "./summary";
import type { AuditInputs, FindingRow } from "./types";

// The Summary sheet's own wording (header, quotation, scope), worked out as
// the workbook does. The figures, coverage and findings come from the engine.

export type SummarySheet = {
  preparedFor: string; // E1
  byLine: string; // E2
  reference: string; // E3
  forwarder: Cell; // C8 (0 when blank: TECH_DEBT B7)
  validity: string; // E8
  service: string; // C9
  route: string; // E9
  shipment: string; // C10
  cargo: string; // E10
  checked: string; // A81
  notChecked: string; // A82
  lineVerification: string; // A83
};

const dateOr = (iso: string | null, none: string) => (iso === null ? none : textDate(dateSerial(iso)));

export function summarySheet(inputs: AuditInputs, f: AuditFigures): SummarySheet {
  const sh = inputs.shipment;
  const q = inputs.quotation;
  return {
    preparedFor: `Prepared for: ${sh.client}`,
    byLine: `By: ${sh.preparedBy}   ·   Audit date: ${dateOr(sh.auditDate, "")}`,
    reference: `Reference: ${sh.auditReference}`,
    forwarder: ref(text(q.forwarder)),
    validity:
      `Freight: ${dateOr(q.freightValidUntil, "not stated")}  ·  origin charges: ${dateOr(q.originChargesValidUntil, "Not Confirmed")}` +
      `  ·  destination charges: ${dateOr(q.destinationChargesValidUntil, "Not Confirmed")}`,
    service: q.mode + (eq(text(q.mode), "Sea FCL") ? `  ·  ${cat(q.containers)} x ${q.containerType}` : ""),
    route: `${sh.portOfLoading} to ${sh.portOfDischarge}${q.routing !== "" ? `  (${q.routing})` : ""}`,
    shipment: `${cat(sh.pieces)} pcs  ·  ${cat(sh.cartons)} cartons  ·  ${cat(sh.pallets)} pallets`,
    cargo: `${textQty2(sh.grossWeightKg)} kg  ·  ${textQty3(sh.volumeCbm)} CBM  ·  ${sh.incoterm} ${sh.namedPlace}`,
    checked:
      "Checked: calculations, charging bases and quantities, consistency with the commercial invoice and packing list, duplicated or unexplained charges, missing charges, coverage of the requested services" +
      (eq(text(sh.rateAgreementProvided), "Yes") ? ", and agreed rates." : "."),
    notChecked: `Not checked: ${f.notChecked}`,
    lineVerification: `Line verification: ${f.verificationText}. 'Verified' means the forwarder's own line amount reconciles; other lines are calculated from the entered rates only.`,
  };
}

// A Summary question line ("Charge - action").
export const summaryQuestion = (x: FindingRow) => `${cat(x.charge)} - ${cat(x.action)}`;

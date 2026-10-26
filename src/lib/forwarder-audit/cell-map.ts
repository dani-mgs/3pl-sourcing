import { cat } from "./calc-semantics";
import { isoFromSerial } from "./text-format";
import { EMPTY_LINE } from "./lines";
import { MAX_LINES, SERVICES } from "./lists";
import type { AuditInputs, ChargeLineInputs, QuotationInputs, QuotedCargoInputs, ShipmentInputs } from "./types";

// Where each input lives on the v1.0 Audit sheet, and how to read a filled
// workbook's input cells (as the golden fixtures hold them) into AuditInputs.
// scripts/forwarder-audit/golden.py reads the same cells.

type Kind = "text" | "number" | "date";
type FieldMap<T> = { [K in keyof T]: [cell: string, kind: Kind] };

export const SHIPMENT_CELLS: FieldMap<ShipmentInputs> = {
  auditReference: ["C6", "text"],
  auditDate: ["J6", "date"],
  client: ["C7", "text"],
  clientRole: ["J7", "text"],
  incoterm: ["C8", "text"],
  namedPlace: ["J8", "text"],
  portOfLoading: ["C9", "text"],
  portOfDischarge: ["J9", "text"],
  pickupAddress: ["C10", "text"],
  deliveryAddress: ["J10", "text"],
  cargoReadyDate: ["C11", "date"],
  commodity: ["J11", "text"],
  hsCode: ["C12", "text"],
  goodsValue: ["J12", "number"],
  goodsValueCurrency: ["C13", "text"],
  pieces: ["J13", "number"],
  cartons: ["C14", "number"],
  pallets: ["J14", "number"],
  grossWeightKg: ["C15", "number"],
  volumeCbm: ["J15", "number"],
  packageDimensions: ["C16", "text"],
  stackable: ["J16", "text"],
  woodPackaging: ["C17", "text"],
  specialCargo: ["J17", "text"],
  commercialInvoiceReceived: ["C18", "text"],
  packingListReceived: ["J18", "text"],
  rateAgreementProvided: ["C19", "text"],
  quotationItemised: ["J19", "text"],
  preferentialOrigin: ["C20", "text"],
  importLicenceConfirmed: ["J20", "text"],
  preparedBy: ["C21", "text"],
  plVolumeCoversAll: ["J21", "text"],
};

export const QUOTATION_CELLS: FieldMap<QuotationInputs> = {
  forwarder: ["C23", "text"],
  quotationReference: ["J23", "text"],
  quotationSource: ["C24", "text"],
  freightValidUntil: ["J24", "date"],
  currency: ["C25", "text"],
  mode: ["J25", "text"],
  containers: ["C26", "number"],
  containerType: ["J26", "text"],
  quotedTerm: ["C27", "text"],
  routing: ["J27", "text"],
  transitTime: ["C28", "text"],
  freeTimeDays: ["J28", "text"],
  loadPlanConfirmed: ["C29", "text"],
  routeMatchesRequest: ["J29", "text"],
  airDivisor: ["C30", "number"],
  statedTotal: ["J30", "number"],
  otherCurrency1: ["C31", "text"],
  otherCurrency1Rate: ["J31", "number"],
  otherCurrency2: ["C32", "text"],
  otherCurrency2Rate: ["J32", "number"],
  originChargesValidUntil: ["C33", "date"],
  destinationChargesValidUntil: ["J33", "date"],
};

export const QUOTED_CARGO_CELLS: FieldMap<QuotedCargoInputs> = {
  pieces: ["D35", "number"],
  packages: ["D36", "number"],
  grossWeightKg: ["D37", "number"],
  volumeCbm: ["D38", "number"],
  acceptWeightDifference: ["G37", "text"],
  acceptVolumeDifference: ["G38", "text"],
};

export const FIRST_SERVICE_ROW = 43;
export const FIRST_LINE_ROW = 54;
export const LINE_COLUMNS: FieldMap<ChargeLineInputs> = {
  charge: ["B", "text"],
  category: ["C", "text"],
  basis: ["D", "text"],
  rate: ["E", "number"],
  currency: ["F", "text"],
  status: ["G", "text"],
  quantityOverride: ["I", "number"],
  minimumCharge: ["J", "number"],
  localTaxRate: ["K", "number"],
  forwarderLineTotal: ["L", "number"],
  agreedRate: ["M", "number"],
  reviewerFlag: ["N", "text"],
  note: ["O", "text"],
};

export type CellValues = Record<string, number | string>;

function read(cells: CellValues, cell: string, kind: Kind): string | number | null {
  const v = cells[cell];
  if (kind === "text") return v === undefined ? "" : cat(v);
  if (v === undefined || v === "") return null;
  if (typeof v !== "number") throw new Error(`${cell} holds text where the workbook expects a ${kind}: ${JSON.stringify(v)}`);
  return kind === "date" ? isoFromSerial(v) : v;
}

function readGroup<T>(cells: CellValues, map: FieldMap<T>, cellOf: (cell: string) => string = (c) => c): T {
  const out = {} as Record<string, unknown>;
  for (const [field, [cell, kind]] of Object.entries(map) as [string, [string, Kind]][]) out[field] = read(cells, cellOf(cell), kind);
  return out as T;
}

const isEmptyLine = (l: ChargeLineInputs) => (Object.keys(EMPTY_LINE) as (keyof ChargeLineInputs)[]).every((k) => l[k] === EMPTY_LINE[k]);

export function inputsFromCells(cells: CellValues): AuditInputs {
  const lines = Array.from({ length: MAX_LINES }, (_, i) => readGroup(cells, LINE_COLUMNS, (col) => `${col}${FIRST_LINE_ROW + i}`));
  while (lines.length > 0 && isEmptyLine(lines[lines.length - 1])) lines.pop();
  return {
    shipment: readGroup(cells, SHIPMENT_CELLS),
    quotation: readGroup(cells, QUOTATION_CELLS),
    quotedCargo: readGroup(cells, QUOTED_CARGO_CELLS),
    services: SERVICES.map((_, s) => ({
      requested: read(cells, `C${FIRST_SERVICE_ROW + s}`, "text") as string,
      mark: read(cells, `G${FIRST_SERVICE_ROW + s}`, "text") as string,
    })),
    lines,
  };
}

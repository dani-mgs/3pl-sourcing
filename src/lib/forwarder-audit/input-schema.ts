import { z } from "zod";
import { MAX_LINES, SERVICES, BASES, CATEGORY_NAMES, CLIENT_ROLES, CONTAINER_TYPES, FLAG_NAMES, INCOTERMS, LINE_STATUSES, MODES, ROUTE_MATCHES, SERVICE_MARKS, YES_NO, YES_NO_UNKNOWN } from "./lists";
import { QUOTATION_CELLS, QUOTED_CARGO_CELLS, SHIPMENT_CELLS } from "./cell-map";
import { EMPTY_LINE } from "./lines";
import type { AuditInputs } from "./types";

// What a Forwarder Audit may store and what the browser may send: the Audit
// sheet's input cells, strictly checked. Dropdown fields hold a value from
// the workbook's Lists (or stay blank); free text is bounded; numbers are
// finite and below 1e12; dates are real calendar dates.

const blankOr = (values: readonly string[]) => z.string().refine((v) => v === "" || values.includes(v), "Pick a value from the list.");
const text = (max: number) => z.string().max(max, `At most ${max} characters.`);
const number = z.number().finite().min(-1e12).max(1e12).nullable();
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date.")
  .refine((v) => {
    const d = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, "Use a real date.")
  .nullable();

const lineSchema = z.strictObject({
  charge: text(200),
  category: blankOr(CATEGORY_NAMES),
  basis: blankOr(BASES),
  rate: number,
  currency: text(10),
  status: blankOr(LINE_STATUSES),
  quantityOverride: number,
  minimumCharge: number,
  localTaxRate: number,
  forwarderLineTotal: number,
  agreedRate: number,
  reviewerFlag: blankOr(FLAG_NAMES),
  note: text(500),
});

export const inputsSchema = z.strictObject({
  shipment: z.strictObject({
    auditReference: text(100),
    auditDate: date,
    client: text(200),
    clientRole: blankOr(CLIENT_ROLES),
    incoterm: blankOr(INCOTERMS),
    namedPlace: text(200),
    portOfLoading: text(200),
    portOfDischarge: text(200),
    pickupAddress: text(500),
    deliveryAddress: text(500),
    cargoReadyDate: date,
    commodity: text(200),
    hsCode: text(50),
    goodsValue: number,
    goodsValueCurrency: text(10),
    pieces: number,
    cartons: number,
    pallets: number,
    grossWeightKg: number,
    volumeCbm: number,
    packageDimensions: text(1000),
    stackable: blankOr(YES_NO_UNKNOWN),
    woodPackaging: blankOr(YES_NO_UNKNOWN),
    specialCargo: blankOr(YES_NO),
    commercialInvoiceReceived: blankOr(YES_NO),
    packingListReceived: blankOr(YES_NO),
    rateAgreementProvided: blankOr(YES_NO),
    quotationItemised: blankOr(YES_NO),
    preferentialOrigin: blankOr(YES_NO_UNKNOWN),
    importLicenceConfirmed: blankOr(YES_NO_UNKNOWN),
    preparedBy: text(100),
    plVolumeCoversAll: blankOr(YES_NO_UNKNOWN),
  }),
  quotation: z.strictObject({
    forwarder: text(200),
    quotationReference: text(200),
    quotationSource: text(200),
    freightValidUntil: date,
    currency: text(10),
    mode: blankOr(MODES),
    containers: number,
    containerType: blankOr(CONTAINER_TYPES),
    quotedTerm: text(200),
    routing: text(200),
    transitTime: text(100),
    freeTimeDays: text(100),
    loadPlanConfirmed: blankOr(YES_NO),
    routeMatchesRequest: blankOr(ROUTE_MATCHES),
    airDivisor: number,
    statedTotal: number,
    otherCurrency1: text(10),
    otherCurrency1Rate: number,
    otherCurrency2: text(10),
    otherCurrency2Rate: number,
    originChargesValidUntil: date,
    destinationChargesValidUntil: date,
  }),
  quotedCargo: z.strictObject({
    pieces: number,
    packages: number,
    grossWeightKg: number,
    volumeCbm: number,
    acceptWeightDifference: blankOr(YES_NO),
    acceptVolumeDifference: blankOr(YES_NO),
  }),
  services: z.array(z.strictObject({ requested: blankOr(YES_NO), mark: blankOr(SERVICE_MARKS) })).length(SERVICES.length),
  lines: z.array(lineSchema).max(MAX_LINES, `At most ${MAX_LINES} charge lines.`),
});

type Kind = "text" | "number" | "date";
const blankFor = (map: Record<string, [string, Kind]>) =>
  Object.fromEntries(Object.entries(map).map(([field, [, kind]]) => [field, kind === "text" ? "" : null]));

export function blankInputs(): AuditInputs {
  return {
    shipment: blankFor(SHIPMENT_CELLS) as AuditInputs["shipment"],
    quotation: blankFor(QUOTATION_CELLS) as AuditInputs["quotation"],
    quotedCargo: blankFor(QUOTED_CARGO_CELLS) as AuditInputs["quotedCargo"],
    services: SERVICES.map(() => ({ requested: "", mark: "" })),
    lines: [],
  };
}

export const blankLine = () => ({ ...EMPTY_LINE });

export type InputIssue = { path: string; message: string };

// Strict parse for saving; trailing empty charge lines are dropped.
export function parseInputs(value: unknown): { ok: true; inputs: AuditInputs } | { ok: false; issues: InputIssue[] } {
  const parsed = inputsSchema.safeParse(value);
  if (!parsed.success) {
    return { ok: false, issues: parsed.error.issues.slice(0, 5).map((i) => ({ path: i.path.join("."), message: i.message })) };
  }
  const lines = [...parsed.data.lines];
  while (lines.length > 0 && JSON.stringify(lines[lines.length - 1]) === JSON.stringify(EMPTY_LINE)) lines.pop();
  return { ok: true, inputs: { ...parsed.data, lines } };
}

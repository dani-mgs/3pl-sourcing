import type { Cell } from "./calc-semantics";

// What a Forwarder Audit stores: the Audit sheet's input cells (sections 1-4),
// nothing calculated. Text "" is an empty cell; dates are ISO ("2026-06-30").
// Dropdown fields hold the workbook's list values but are compared
// case-insensitively, as the workbook does, so any text is safe.

export type ShipmentInputs = {
  auditReference: string; // C6
  auditDate: string | null; // J6
  client: string; // C7
  clientRole: string; // J7 Buyer / Seller / Other
  incoterm: string; // C8
  namedPlace: string; // J8
  portOfLoading: string; // C9
  portOfDischarge: string; // J9
  pickupAddress: string; // C10
  deliveryAddress: string; // J10
  cargoReadyDate: string | null; // C11
  commodity: string; // J11
  hsCode: string; // C12
  goodsValue: number | null; // J12
  goodsValueCurrency: string; // C13
  pieces: number | null; // J13
  cartons: number | null; // C14
  pallets: number | null; // J14
  grossWeightKg: number | null; // C15
  volumeCbm: number | null; // J15
  packageDimensions: string; // C16
  stackable: string; // J16
  woodPackaging: string; // C17
  specialCargo: string; // J17
  commercialInvoiceReceived: string; // C18
  packingListReceived: string; // J18
  rateAgreementProvided: string; // C19
  quotationItemised: string; // J19
  preferentialOrigin: string; // C20
  importLicenceConfirmed: string; // J20
  preparedBy: string; // C21
  plVolumeCoversAll: string; // J21
};

export type QuotationInputs = {
  forwarder: string; // C23
  quotationReference: string; // J23
  quotationSource: string; // C24
  freightValidUntil: string | null; // J24
  currency: string; // C25
  mode: string; // J25 Sea FCL / Sea LCL / Air
  containers: number | null; // C26
  containerType: string; // J26
  quotedTerm: string; // C27
  routing: string; // J27
  transitTime: string; // C28
  freeTimeDays: string; // J28 (free text, e.g. "14 (combined)")
  loadPlanConfirmed: string; // C29
  routeMatchesRequest: string; // J29
  airDivisor: number | null; // C30
  statedTotal: number | null; // J30
  otherCurrency1: string; // C31
  otherCurrency1Rate: number | null; // J31
  otherCurrency2: string; // C32
  otherCurrency2Rate: number | null; // J32
  originChargesValidUntil: string | null; // C33
  destinationChargesValidUntil: string | null; // J33
};

// Section 1's "Cargo basis": what the quotation states (blank = not stated).
export type QuotedCargoInputs = {
  pieces: number | null; // D35
  packages: number | null; // D36
  grossWeightKg: number | null; // D37
  volumeCbm: number | null; // D38
  acceptWeightDifference: string; // G37
  acceptVolumeDifference: string; // G38
};

// Section 3, one per service in SERVICES order.
export type ServiceInputs = {
  requested: string; // C43:C49 Yes / No
  mark: string; // G43:G49 Included / Excluded / Not applicable (only when no lines)
};

// Section 4, one charge line (rows 54-103).
export type ChargeLineInputs = {
  charge: string; // B
  category: string; // C
  basis: string; // D
  rate: number | null; // E
  currency: string; // F (blank = quotation currency)
  status: string; // G
  quantityOverride: number | null; // I
  minimumCharge: number | null; // J
  localTaxRate: number | null; // K (0.08 = 8%)
  forwarderLineTotal: number | null; // L
  agreedRate: number | null; // M
  reviewerFlag: string; // N
  note: string; // O
};

export type AuditInputs = {
  shipment: ShipmentInputs;
  quotation: QuotationInputs;
  quotedCargo: QuotedCargoInputs;
  services: ServiceInputs[]; // 7
  lines: ChargeLineInputs[]; // up to 50; line number = position + 1
};

// One charge line's results (hidden Checks columns B-Z).
export type LineResult = {
  line: number;
  name: string; // B
  category: string; // C
  service: string; // D
  group: string; // E
  status: string; // F
  basisCode: number; // G
  rate: number | ""; // H
  currency: number | string; // I (0 when the quotation currency is blank)
  fx: number | ""; // J
  quantity: Cell; // K "Qty used" (an error when the divisor is 0)
  preTax: number | ""; // L
  inclTax: number | ""; // M
  total: number | ""; // N "Calculated total (quote cur.)"
  priced: 0 | 1; // O
  forwarderTotal: number | ""; // P
  check: Cell; // Q, "#VALUE!" possible (TECH_DEBT B2)
  difference: number | ""; // R
  agreedExcess: number; // S
  flag: string; // T
  duplicate: 0 | 1; // U
  inScope: Cell; // V
  unpriced: 0 | 1; // W
  questionKind: string; // X
  taxRate: number; // Y
  firmPreTax: number; // Z
};

export type CoverageResult = {
  service: string; // A
  requested: string; // B
  pricedLines: number; // C
  unpricedLines: number; // D
  includedLines: number; // E
  excludedLines: number; // F
  notApplicableLines: number; // G
  found: string; // H
  mark: string; // I
  coverage: string; // J
  firmAmount: number; // K
  payer: string; // L "Normally paid by"
  firmLines: number; // M
  mismatchParty: string; // N "seller" / "buyer" / ""
};

export type FindingType = "Error" | "Question" | "Risk";

// One row of the findings table (hidden Checks rows 70-319).
export type FindingRow = {
  key: string; // A
  row: number; // the workbook row: the tie-break in the ranking
  active: 0 | 1; // B
  type: FindingType; // C
  order: number; // D: Error 1, Question 2, Risk 3
  charge: Cell; // E
  issue: Cell; // F
  explanation: Cell; // G
  action: Cell; // H
  amount: Cell; // I "Amount at stake"
  rank: number | ""; // J
  questionRank: number | ""; // K
};

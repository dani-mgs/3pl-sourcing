// The v1.0 workbook's Lists sheet: dropdown values, the Incoterm payer table,
// reviewer flags and settings. Frozen with the workbook; order matters (the
// basis position is the workbook's CHOOSE index, services are in sheet order).

export const TEMPLATE_VERSION = "1.0";

export const SERVICES = [
  "Pickup",
  "Export & origin",
  "Main freight",
  "Destination port & handling",
  "Import clearance",
  "Delivery",
  "Duties & taxes",
] as const;

// Category -> group and service (Lists A4:C16).
export const CATEGORIES: readonly { name: string; group: string; service: string }[] = [
  { name: "O1 Pickup", group: "Origin", service: "Pickup" },
  { name: "O2 Origin terminal & handling", group: "Origin", service: "Export & origin" },
  { name: "O3 Export docs, filing & clearance", group: "Origin", service: "Export & origin" },
  { name: "F1 Base freight", group: "Main Freight", service: "Main freight" },
  { name: "F2 Freight surcharges", group: "Main Freight", service: "Main freight" },
  { name: "D1 Destination terminal & port", group: "Destination", service: "Destination port & handling" },
  { name: "D2 Destination docs & handling", group: "Destination", service: "Destination port & handling" },
  { name: "D3 Import customs clearance", group: "Destination", service: "Import clearance" },
  { name: "D4 Delivery", group: "Destination", service: "Delivery" },
  { name: "T1 Import duty", group: "Duties/Taxes", service: "Duties & taxes" },
  { name: "T2 Import VAT / GST", group: "Duties/Taxes", service: "Duties & taxes" },
  { name: "T3 Tax-related fees", group: "Duties/Taxes", service: "Duties & taxes" },
  { name: "Unclassified", group: "Other", service: "Other" },
];
export const CATEGORY_NAMES = CATEGORIES.map((c) => c.name);

// Lists E4:E14; position 1..11 is the basis code.
export const BASES = [
  "per container",
  "per B/L",
  "per shipment",
  "per declaration / set",
  "per CBM",
  "per RT (CBM or tonne)",
  "per kg",
  "per unit (enter qty)",
  "% of base (enter base)",
  "lump sum",
  "at cost",
] as const;
export const BASIS = { container: 1, cbm: 5, rt: 6, kg: 7, percent: 9, atCost: 11 } as const;

export const LINE_STATUSES = ["Firm", "Estimate", "If required", "At cost", "TBC", "Included", "Excluded", "Not applicable"] as const;

// Who normally pays each service under Incoterms 2020 (Lists I4:P14), in
// SERVICES order. "Shared" raises no question.
export const INCOTERM_PAYERS: readonly { incoterm: string; payers: readonly string[] }[] = [
  { incoterm: "EXW", payers: ["Buyer", "Buyer", "Buyer", "Buyer", "Buyer", "Buyer", "Buyer"] },
  { incoterm: "FCA", payers: ["Buyer", "Shared", "Buyer", "Buyer", "Buyer", "Buyer", "Buyer"] },
  { incoterm: "FAS", payers: ["Seller", "Shared", "Buyer", "Buyer", "Buyer", "Buyer", "Buyer"] },
  { incoterm: "FOB", payers: ["Seller", "Seller", "Buyer", "Buyer", "Buyer", "Buyer", "Buyer"] },
  { incoterm: "CFR", payers: ["Seller", "Seller", "Seller", "Shared", "Buyer", "Buyer", "Buyer"] },
  { incoterm: "CIF", payers: ["Seller", "Seller", "Seller", "Shared", "Buyer", "Buyer", "Buyer"] },
  { incoterm: "CPT", payers: ["Seller", "Seller", "Seller", "Shared", "Buyer", "Shared", "Buyer"] },
  { incoterm: "CIP", payers: ["Seller", "Seller", "Seller", "Shared", "Buyer", "Shared", "Buyer"] },
  { incoterm: "DAP", payers: ["Seller", "Seller", "Seller", "Seller", "Buyer", "Seller", "Buyer"] },
  { incoterm: "DPU", payers: ["Seller", "Seller", "Seller", "Seller", "Buyer", "Seller", "Buyer"] },
  { incoterm: "DDP", payers: ["Seller", "Seller", "Seller", "Seller", "Seller", "Seller", "Seller"] },
];
export const INCOTERMS = INCOTERM_PAYERS.map((r) => r.incoterm);

// Reviewer flags (Lists A21:G25). useLineAmount: the flag's finding carries
// the line's amount.
export const REVIEWER_FLAGS: readonly { flag: string; issue: string; explanation: string; action: string; useLineAmount: number }[] = [
  {
    flag: "Possible duplicate",
    issue: "Possible duplicate charge",
    explanation: "The same service may already be charged in another line.",
    action: "Ask whether this service is already included elsewhere; remove it if duplicated.",
    useLineAmount: 1,
  },
  {
    flag: "Unclear / unexplained",
    issue: "Charge not explained",
    explanation: "The charge name or purpose is not clear from the quotation.",
    action: "Ask the forwarder what this charge covers and why it applies.",
    useLineAmount: 1,
  },
  {
    flag: "Not applicable to this cargo",
    issue: "May not apply to this shipment",
    explanation: "The charge does not appear to apply to this cargo or route.",
    action: "Ask the forwarder to remove it or explain why it applies.",
    useLineAmount: 1,
  },
  {
    flag: "Questionable basis or unit",
    issue: "Charging basis looks wrong",
    explanation: "The unit or quantity used does not suit this charge.",
    action: "Ask the forwarder to confirm the unit and quantity used.",
    useLineAmount: 0,
  },
  {
    flag: "Other - see note",
    issue: "Reviewer query",
    explanation: "See the note on this line.",
    action: "Raise the note with the forwarder.",
    useLineAmount: 0,
  },
];
export const FLAG_NAMES = REVIEWER_FLAGS.map((f) => f.flag);

// Lists B41:B44. Read-only in the app.
export type AuditSettings = {
  airDivisor: number;
  validityWarningDays: number;
  reviewThresholdPercent: number;
  roundingTolerance: number;
};
export const V1_SETTINGS: AuditSettings = {
  airDivisor: 6000,
  validityWarningDays: 7,
  reviewThresholdPercent: 0,
  roundingTolerance: 0.01,
};

// Fixed dropdowns on the Audit sheet.
export const YES_NO = ["Yes", "No"] as const;
export const YES_NO_UNKNOWN = ["Yes", "No", "Unknown"] as const;
export const CLIENT_ROLES = ["Buyer", "Seller", "Other"] as const;
export const MODES = ["Sea FCL", "Sea LCL", "Air"] as const;
export const CONTAINER_TYPES = ["20GP", "40GP", "40HC", "45HC", "Other"] as const;
export const ROUTE_MATCHES = ["Yes", "No", "Partly"] as const;
export const SERVICE_MARKS = ["Included", "Excluded", "Not applicable"] as const;

export const MAX_LINES = 50;
export const MAX_FINDINGS_SHOWN = 30;
export const MAX_SUMMARY_QUESTIONS = 15;

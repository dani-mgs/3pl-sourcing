// Option lists and field layout for forwarder projects. The option lists
// copy the check constraints in
// supabase/migrations/20260928094641_forwarder_sourcing_tables.sql exactly;
// keep them in step if a constraint changes.

export const PROJECT_STATUSES = ["Active", "On Hold", "Completed"] as const;

export const INCOTERMS = [
  "EXW",
  "FCA",
  "FAS",
  "FOB",
  "CFR",
  "CIF",
  "CPT",
  "CIP",
  "DAP",
  "DPU",
  "DDP",
  "DDU (legacy term)",
] as const;

export const SHIPMENT_MODES = ["Air", "Sea", "Road"] as const;
export type ShipmentMode = (typeof SHIPMENT_MODES)[number];

export const SHIPMENT_TYPES = [
  "FCL",
  "LCL",
  "Air Freight",
  "Courier",
  "Full Truck Load (FTL)",
  "Less-than-Truckload (LTL)",
] as const;
export type ShipmentType = (typeof SHIPMENT_TYPES)[number];

// Which shipment types go with each mode. The database accepts any pairing;
// the app narrows the choice and enforces it on the server. Shared with the
// quote form.
export const SHIPMENT_TYPES_BY_MODE: Record<ShipmentMode, readonly ShipmentType[]> =
  {
    Air: ["Air Freight", "Courier"],
    Sea: ["FCL", "LCL"],
    Road: ["Full Truck Load (FTL)", "Less-than-Truckload (LTL)", "Courier"],
  };

export function isTypeAllowedForMode(
  mode: string | null,
  type: string | null,
): boolean {
  if (type == null) return true;
  if (mode == null) return false;
  const allowed = SHIPMENT_TYPES_BY_MODE[mode as ShipmentMode] as
    | readonly string[]
    | undefined;
  return allowed?.includes(type) ?? false;
}

export const YES_NO = ["Yes", "No"] as const;
export const STACKABLE_OPTIONS = ["Yes", "No", "Unknown"] as const;
export const INSURANCE_OPTIONS = [
  "Yes",
  "No",
  "Quote Both With and Without",
] as const;
export const BROKERAGE_OPTIONS = ["Yes", "No", "N/A"] as const;

// Same list as forwarder_quotes.original_currency. invoice_currency is free
// text in the database; the form offers this list.
export const CURRENCIES = [
  "USD",
  "EUR",
  "GBP",
  "CNY",
  "JPY",
  "CAD",
  "AUD",
  "MXN",
  "INR",
  "PHP",
  "VND",
  "THB",
  "HKD",
  "SGD",
  "KRW",
] as const;

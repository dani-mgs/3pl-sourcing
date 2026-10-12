// Fixed, plain-language labels for the project facts a client sees. Only
// values in these maps are shared; anything else is left out rather than
// copied through.

const MODES: Record<string, string> = { Sea: "Sea freight", Air: "Air freight", Road: "Road freight" };

const SHIPMENT_TYPES: Record<string, string> = {
  FCL: "full container (FCL)",
  LCL: "shared container (LCL)",
  "Air Freight": "air cargo",
  Courier: "courier",
  "Full Truck Load (FTL)": "full truckload (FTL)",
  "Less-than-Truckload (LTL)": "part truckload (LTL)",
};

const INCOTERMS: Record<string, string> = {
  EXW: "Ex works (EXW)",
  FCA: "Free carrier (FCA)",
  FAS: "Free alongside ship (FAS)",
  FOB: "Free on board (FOB)",
  CFR: "Cost and freight (CFR)",
  CIF: "Cost, insurance and freight (CIF)",
  CPT: "Carriage paid to (CPT)",
  CIP: "Carriage and insurance paid (CIP)",
  DAP: "Delivered at place (DAP)",
  DPU: "Delivered at place unloaded (DPU)",
  DDP: "Delivered duty paid (DDP)",
  "DDU (legacy term)": "Delivered duty unpaid (DDU)",
};

const BUSINESS_MODELS: Record<string, string> = {
  B2C: "Direct-to-consumer (B2C)",
  B2B: "Business-to-business (B2B)",
  "B2B & B2C": "B2B and direct-to-consumer",
};

const whole = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const oneDecimal = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

export function modeLabel(mode: string | null, type: string | null): string | null {
  const m = mode ? MODES[mode] : undefined;
  const t = type ? SHIPMENT_TYPES[type] : undefined;
  if (m && t) return `${m}, ${t}`;
  return m ?? (t ? t.charAt(0).toUpperCase() + t.slice(1) : null);
}

export function incotermLabel(incoterm: string | null): string | null {
  return incoterm ? (INCOTERMS[incoterm] ?? null) : null;
}

export function businessModelLabel(model: string | null): string | null {
  return model ? (BUSINESS_MODELS[model] ?? null) : null;
}

export function shipmentsLabel(perMonth: number | null, perYear: number | null): string | null {
  if (perMonth != null && perMonth > 0) {
    return `${oneDecimal.format(perMonth)} shipment${perMonth === 1 ? "" : "s"} a month`;
  }
  if (perYear != null && perYear > 0) return `${oneDecimal.format(perYear)} shipment${perYear === 1 ? "" : "s"} a year`;
  return null;
}

export function monthsLabel(months: number | null, noun: string): string | null {
  return months != null && months > 0 ? `${whole.format(months)}-month ${noun}` : null;
}

export function ordersLabel(orders: number | null): string | null {
  return orders != null && orders > 0 ? `About ${whole.format(orders)} orders a month` : null;
}

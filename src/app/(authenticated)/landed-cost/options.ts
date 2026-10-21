// Choices shown on the Landed Cost forms (the values the parsers accept).

export const MODE_LABELS: Record<string, string> = { Sea: "Sea (ocean)", Air: "Air", Road: "Road" };

// SUPPORTED_INCOTERMS: the price excludes international freight, so qty x
// price is the entered value. Delivered terms come later.
export const INCOTERMS = ["EXW", "FCA", "FAS", "FOB"] as const;

export const ENTRY_TYPE_HINT =
  "Automatic: an informal entry (flat MPF) when the entered value is within the informal limit, formal above. Formal: always formal, as when a broker files a formal entry.";

export const FREIGHT_BASIS_LABELS: Record<string, string> = {
  chargeable_weight: "Chargeable weight",
  value: "Value (FOB)",
  units: "Units",
};

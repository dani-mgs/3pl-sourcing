// How a quote is named now that it has no scenario group: its terms
// ("DDP · Sea · FCL"), and its lane when the quote has one. Old quotes keep
// their stored scenario text, but only as a read-only note (see
// legacy_scenario on ComparisonQuote); it is never used here.

type QuoteTerms = {
  incoterm: string | null;
  shipment_mode: string | null;
  shipment_type: string | null;
};

type QuoteLane = {
  origin?: string | null;
  destination?: string | null;
};

function filled(value: string | null | undefined): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

// "DDU (legacy term)" reads as "DDU" in a label.
function shortIncoterm(incoterm: string | null): string | null {
  const value = filled(incoterm);
  return value ? value.replace(/\s*\(legacy term\)$/i, "") : null;
}

// "DDP · Sea · FCL"; "Quote" when none of the three is set.
export function quoteLabel(quote: QuoteTerms): string {
  const parts = [
    shortIncoterm(quote.incoterm),
    filled(quote.shipment_mode),
    filled(quote.shipment_type),
  ].filter((part): part is string => part != null);
  return parts.length ? parts.join(" · ") : "Quote";
}

// "Ho Chi Minh City → Guangzhou", "Ho Chi Minh City → —" when one end is
// missing, or null when neither is set.
export function quoteRoute(quote: QuoteLane): string | null {
  const origin = filled(quote.origin);
  const destination = filled(quote.destination);
  if (!origin && !destination) return null;
  return `${origin ?? "—"} → ${destination ?? "—"}`;
}

// One string for places that can't show two lines (titles, menus, aria).
export function quoteTitle(quote: QuoteTerms & QuoteLane): string {
  const route = quoteRoute(quote);
  return route ? `${quoteLabel(quote)} · ${route}` : quoteLabel(quote);
}

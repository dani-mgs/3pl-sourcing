import { z } from "zod";
import { formatCurrency } from "@/lib/currency";
import { CURRENCIES } from "@/lib/forwarder/project-fields";
import { resolveInitialRate, type LatestRates, type RateState } from "@/lib/fx/rate-provenance";
import { SHIPMENT_MODES, customsValueInUsd, type ShipmentMode } from "./calculate";
import { countryName } from "./countries";
import { defaultEntryDate } from "./entry-date";
import { formatHtsCode, normalizeHtsCode } from "./hts-code";
import { matchOriginCountry, type OriginMatch } from "./origin-match";
import { centsToNumber, parseDecimal, sub, toCents, type Rational } from "./rational";

// "Estimate duties" from Forwarder Sourcing: what the calculator suggests
// from a project (and optionally one quote), the snapshot a linked estimate
// keeps of those values, what changed since, and how the estimate compares
// with the duties the forwarder quoted. Pure functions; the server loads the
// rows (server-forwarder-link.ts). Every suggestion is shown for the user to
// confirm; nothing here is applied without that.

// ---- Source rows ---------------------------------------------------------------

export type LinkProject = {
  id: string;
  updated_at: string;
  hs_code: string | null;
  origin_country: string | null;
  invoice_value: number | null;
  invoice_currency: string | null;
  current_incoterm: string | null;
  current_freight_cost_usd: number | null;
  shipment_mode: string | null;
  weight_kg: number | null;
  units: number | null;
};

export type LinkQuote = {
  id: string;
  updated_at: string;
  forwarder_id: string;
  forwarder_name: string;
  scenario_group: string;
  shipment_mode: string | null;
  cost_of_goods_usd: number | null;
  duties_taxes_usd: number | null;
  // The quote's lead time in days; the default expected entry date is today
  // plus the longer of the two.
  lead_time_min_days: number | null;
  lead_time_max_days: number | null;
};

export const LINK_PROJECT_COLUMNS =
  "id, updated_at, hs_code, origin_country, invoice_value, invoice_currency, current_incoterm, " +
  "current_freight_cost_usd, shipment_mode, weight_kg, units";

// Terms under which the supplier's invoice price includes international
// freight (and, for CIF/CIP, insurance). Customs value excludes them, so the
// calculator offers to deduct them. DDU is the legacy name for DAP.
export const DELIVERED_INCOTERMS: readonly string[] = [
  "CFR",
  "CIF",
  "CPT",
  "CIP",
  "DAP",
  "DPU",
  "DDP",
  "DDU (legacy term)",
];

export function invoiceIncludesFreight(incoterm: string | null | undefined): boolean {
  return incoterm != null && DELIVERED_INCOTERMS.includes(incoterm);
}

export const DEDUCTION_PROMPT = "Customs value excludes international freight and insurance. Deduct?";
export const DEDUCTION_NOTE = "Deduct the freight and insurance included in the supplier's invoice price.";
export const QUANTITY_HINT = "HTS rates use net weight in the rate's unit; confirm.";

// ---- HTS lookup (done by the server against the current release) -------------

export type HtsLookup =
  | { status: "missing" }
  | { status: "invalid"; text: string; error: string }
  | { status: "not_found"; digits: string }
  // An 8-digit code with several 10-digit lines: the user picks one.
  | { status: "several"; digits: string; description: string | null }
  | {
      status: "found";
      digits: string;
      description: string;
      ancestorDescriptions: string[];
      // The general rate is charged per unit: the quantity it needs.
      perUnit: { unit: string; unitLabel: string } | null;
    };

export function htsLookupInput(hsCode: string | null): { digits: string } | HtsLookup {
  if (hsCode == null || hsCode.trim() === "") return { status: "missing" };
  const code = normalizeHtsCode(hsCode);
  if (!code.ok) return { status: "invalid", text: hsCode.trim(), error: code.error };
  return { digits: code.digits };
}

// ---- Pre-fill -------------------------------------------------------------------

export type CustomsValueBasis = "invoice" | "quote_cost_of_goods";

export type CustomsBasisOption = {
  key: CustomsValueBasis;
  label: string;
  amount: string;
  // Null when the project has no invoice currency: the user chooses one.
  currency: string | null;
  rate: RateState;
};

export type Prefill = {
  hts: {
    value: string;
    projectText: string | null;
    description: string | null;
    ancestorDescriptions: string[];
    warning: string | null;
  };
  origin: { value: string; projectText: string | null; match: OriginMatch; note: string | null };
  customsValue: { options: CustomsBasisOption[]; defaultBasis: CustomsValueBasis | null; note: string | null };
  // Offered when the project's current incoterm includes freight in the price.
  deduction: { incoterm: string; suggestedUsd: string | null } | null;
  mode: { value: ShipmentMode | ""; from: "quote" | "project" | null };
  // Today, or today plus the quote's longest lead time.
  entryDate: { value: string; from: "today" | "quote_lead_time"; leadTimeText: string | null };
  // Only when the rate is charged per unit.
  quantity: { unitLabel: string; suggested: string | null; from: "weight_kg" | "units" | null } | null;
};

function decimalText(value: number | null): string | null {
  if (value == null || !Number.isFinite(value) || value <= 0) return null;
  return String(value);
}

function isShipmentMode(value: string | null | undefined): value is ShipmentMode {
  return value != null && (SHIPMENT_MODES as readonly string[]).includes(value);
}

function htsPrefill(project: LinkProject, lookup: HtsLookup): Prefill["hts"] {
  const projectText = project.hs_code?.trim() || null;
  const base = { projectText, description: null, ancestorDescriptions: [] as string[] };
  switch (lookup.status) {
    case "missing":
      return { ...base, value: "", warning: "The project has no HS code. Enter the 10-digit HTS code." };
    case "invalid":
      return {
        ...base,
        value: "",
        warning: `The project's HS code "${lookup.text}" can't be used: ${lookup.error}`,
      };
    case "not_found":
      return {
        ...base,
        value: formatHtsCode(lookup.digits),
        warning: `${formatHtsCode(lookup.digits)} isn't in the current HTS. Check the code.`,
      };
    case "several":
      return {
        ...base,
        description: lookup.description,
        value: formatHtsCode(lookup.digits),
        warning: `The project's code has 8 digits and ${formatHtsCode(lookup.digits)} has several 10-digit lines. Enter the full 10-digit code.`,
      };
    case "found":
      return {
        ...base,
        value: formatHtsCode(lookup.digits),
        description: lookup.description,
        ancestorDescriptions: lookup.ancestorDescriptions,
        warning:
          lookup.digits.length < 10
            ? "The project's code has fewer than 10 digits. A 10-digit code is recommended: some duties depend on the statistical suffix."
            : null,
      };
  }
}

function originPrefill(project: LinkProject): Prefill["origin"] {
  const projectText = project.origin_country?.trim() || null;
  const match = matchOriginCountry(projectText);
  switch (match.kind) {
    case "match":
      return { value: match.code, projectText, match, note: null };
    case "ambiguous":
      return {
        value: "",
        projectText,
        match,
        note: `"${projectText}" could be ${match.candidates.map(countryName).join(" or ")}. Choose the country of origin.`,
      };
    case "unknown":
      return {
        value: "",
        projectText,
        match,
        note: `"${projectText}" isn't a single country the calculator recognizes. Choose the country of origin.`,
      };
    case "empty":
      return { value: "", projectText, match, note: "The project has no origin country. Choose one." };
  }
}

function quantityPrefill(project: LinkProject, lookup: HtsLookup): Prefill["quantity"] {
  if (lookup.status !== "found" || !lookup.perUnit) return null;
  const { unit, unitLabel } = lookup.perUnit;
  if (unit === "kg" && decimalText(project.weight_kg)) {
    return { unitLabel, suggested: decimalText(project.weight_kg), from: "weight_kg" };
  }
  if (unit === "each" && project.units != null && project.units > 0) {
    return { unitLabel, suggested: String(project.units), from: "units" };
  }
  return { unitLabel, suggested: null, from: null };
}

export function buildPrefill({
  project,
  quote,
  hts,
  latestRates,
  today,
}: {
  project: LinkProject;
  quote: LinkQuote | null;
  hts: HtsLookup;
  latestRates: LatestRates;
  today: string;
}): Prefill {
  const options: CustomsBasisOption[] = [];
  const invoice = decimalText(project.invoice_value);
  if (invoice) {
    const currency =
      project.invoice_currency && (CURRENCIES as readonly string[]).includes(project.invoice_currency)
        ? project.invoice_currency
        : null;
    options.push({
      key: "invoice",
      label: "Project invoice value",
      amount: invoice,
      currency,
      rate: currency
        ? resolveInitialRate({ currency, latest: latestRates, today })
        : { rate: "", source: "manual", date: today },
    });
  }
  const costOfGoods = decimalText(quote?.cost_of_goods_usd ?? null);
  if (costOfGoods) {
    options.push({
      key: "quote_cost_of_goods",
      label: "Cost of goods on this quote",
      amount: costOfGoods,
      currency: "USD",
      rate: { rate: "1", source: null, date: null },
    });
  }
  const invoiceOption = options.find((o) => o.key === "invoice");
  const note =
    options.length === 0
      ? "The project has no invoice value. Enter the customs value."
      : invoiceOption && invoiceOption.currency == null
        ? "The project's invoice has no currency. Choose it before calculating."
        : null;

  const mode = isShipmentMode(quote?.shipment_mode)
    ? { value: quote!.shipment_mode as ShipmentMode, from: "quote" as const }
    : !quote && isShipmentMode(project.shipment_mode)
      ? { value: project.shipment_mode as ShipmentMode, from: "project" as const }
      : { value: "" as const, from: null };

  return {
    hts: htsPrefill(project, hts),
    origin: originPrefill(project),
    customsValue: { options, defaultBasis: options[0]?.key ?? null, note },
    deduction: invoiceIncludesFreight(project.current_incoterm)
      ? {
          incoterm: project.current_incoterm!,
          suggestedUsd: decimalText(project.current_freight_cost_usd),
        }
      : null,
    mode,
    entryDate: entryDatePrefill(quote, today),
    quantity: quantityPrefill(project, hts),
  };
}

// "28–32 days", "32 days", or null when the quote gives none.
export function leadTimeText(min: number | null, max: number | null): string | null {
  const present = [min, max].filter((n): n is number => n != null && Number.isFinite(n));
  if (present.length === 0) return null;
  const [low, high] = [Math.min(...present), Math.max(...present)];
  return low === high ? `${high} days` : `${low}–${high} days`;
}

function entryDatePrefill(quote: LinkQuote | null, today: string): Prefill["entryDate"] {
  const d = defaultEntryDate(today, quote?.lead_time_min_days, quote?.lead_time_max_days);
  return {
    value: d.date,
    from: d.from,
    leadTimeText: d.from === "quote_lead_time" ? leadTimeText(quote!.lead_time_min_days, quote!.lead_time_max_days) : null,
  };
}

// ---- Customs value ---------------------------------------------------------------

export type CustomsValueResult =
  | { ok: true; beforeDeductionUsd: Rational; customsValueUsd: Rational }
  | { ok: false; error: string };

// The converted value (rounded to the cent), less a deduction already in USD.
export function customsValueAfterDeduction(
  value: string,
  rateToUsd: string,
  deductionUsd: string | null,
): CustomsValueResult {
  const beforeDeductionUsd = customsValueInUsd(value, rateToUsd);
  if (deductionUsd == null) return { ok: true, beforeDeductionUsd, customsValueUsd: beforeDeductionUsd };
  const customsValueUsd = sub(beforeDeductionUsd, parseDecimal(deductionUsd));
  if (customsValueUsd.n <= BigInt(0)) {
    return {
      ok: false,
      error: `The deduction (${formatCurrency(Number(deductionUsd), "USD")}) is more than the goods value in USD (${formatCurrency(centsToNumber(toCents(beforeDeductionUsd)), "USD")}). Check both amounts.`,
    };
  }
  return { ok: true, beforeDeductionUsd, customsValueUsd };
}

// ---- Snapshot ------------------------------------------------------------------

const numberOrNull = z.number().nullable();

const snapshotSchema = z.object({
  project: z.object({
    id: z.string(),
    updated_at: z.string(),
    hs_code: z.string().nullable(),
    origin_country: z.string().nullable(),
    invoice_value: numberOrNull,
    invoice_currency: z.string().nullable(),
    current_incoterm: z.string().nullable(),
    current_freight_cost_usd: numberOrNull,
    shipment_mode: z.string().nullable(),
    weight_kg: numberOrNull,
    units: numberOrNull,
  }),
  quote: z
    .object({
      id: z.string(),
      updated_at: z.string(),
      forwarder_id: z.string(),
      forwarder_name: z.string(),
      scenario_group: z.string(),
      shipment_mode: z.string().nullable(),
      cost_of_goods_usd: numberOrNull,
      duties_taxes_usd: numberOrNull,
      // Added with the expected entry date; older snapshots don't have them.
      lead_time_min_days: numberOrNull.optional(),
      lead_time_max_days: numberOrNull.optional(),
    })
    .nullable(),
  choices: z.object({
    customs_value_basis: z.enum(["invoice", "quote_cost_of_goods", "entered"]),
    deduction_offered: z.boolean(),
    quantity_from: z.enum(["weight_kg", "units"]).nullable(),
    // Where the entry date came from; absent on older snapshots.
    entry_date_from: z.enum(["today", "quote_lead_time", "entered"]).optional(),
  }),
});

export type InputSnapshot = z.infer<typeof snapshotSchema>;
export type SnapshotChoices = InputSnapshot["choices"];

function num(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// Numeric columns arrive as numbers (or strings); stored as numbers.
export function normalizeProject(row: Record<string, unknown>): LinkProject {
  return {
    id: String(row.id),
    updated_at: String(row.updated_at),
    hs_code: (row.hs_code as string | null) ?? null,
    origin_country: (row.origin_country as string | null) ?? null,
    invoice_value: num(row.invoice_value),
    invoice_currency: (row.invoice_currency as string | null) ?? null,
    current_incoterm: (row.current_incoterm as string | null) ?? null,
    current_freight_cost_usd: num(row.current_freight_cost_usd),
    shipment_mode: (row.shipment_mode as string | null) ?? null,
    weight_kg: num(row.weight_kg),
    units: num(row.units),
  };
}

export function buildInputSnapshot(
  project: LinkProject,
  quote: LinkQuote | null,
  choices: SnapshotChoices,
): InputSnapshot {
  return { project: { ...project }, quote: quote ? { ...quote } : null, choices };
}

export function parseInputSnapshot(value: unknown): InputSnapshot | null {
  const parsed = snapshotSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

// ---- What changed since ---------------------------------------------------------

export type InputChange = { label: string; then: string; now: string };

const usdText = (v: number | null) => (v == null ? "blank" : formatCurrency(v, "USD"));
const plain = (v: string | number | null) => (v == null || v === "" ? "blank" : String(v));

// The project and quote values the estimate used that are different now.
// Only fields the estimate actually drew on are compared (the invoice value
// only if it was the customs value basis, the weight only if it was the
// quantity, and so on). `quote` is "deleted" when the quote no longer exists.
export function inputChanges(
  snapshot: InputSnapshot,
  project: LinkProject,
  quote: LinkQuote | null | "deleted",
): InputChange[] {
  const changes: InputChange[] = [];
  const then = snapshot.project;
  const { choices } = snapshot;
  const compare = (label: string, a: string, b: string) => {
    if (a !== b) changes.push({ label, then: a, now: b });
  };

  compare("HS code", plain(then.hs_code?.trim() ?? null), plain(project.hs_code?.trim() ?? null));
  compare("Origin", plain(then.origin_country?.trim() ?? null), plain(project.origin_country?.trim() ?? null));
  if (choices.customs_value_basis === "invoice") {
    const money = (v: number | null, c: string | null) =>
      v == null ? "blank" : c ? formatCurrency(v, c) : `${v} (no currency)`;
    compare(
      "Invoice value",
      money(then.invoice_value, then.invoice_currency),
      money(project.invoice_value, project.invoice_currency),
    );
  }
  compare("Current incoterm", plain(then.current_incoterm), plain(project.current_incoterm));
  if (choices.deduction_offered) {
    compare(
      "Current freight cost",
      usdText(then.current_freight_cost_usd),
      usdText(project.current_freight_cost_usd),
    );
  }
  if (!snapshot.quote) compare("Shipment mode", plain(then.shipment_mode), plain(project.shipment_mode));
  if (choices.quantity_from === "weight_kg") {
    compare("Weight (kg)", plain(then.weight_kg), plain(project.weight_kg));
  }
  if (choices.quantity_from === "units") compare("Units", plain(then.units), plain(project.units));

  if (snapshot.quote) {
    if (quote === "deleted" || quote == null) {
      changes.push({ label: "Quote", then: snapshot.quote.scenario_group, now: "deleted" });
    } else {
      const q = snapshot.quote;
      compare("Quote mode", plain(q.shipment_mode), plain(quote.shipment_mode));
      // Only when the entry date was derived from the lead time, and the
      // snapshot recorded it (older snapshots didn't).
      if (
        choices.entry_date_from === "quote_lead_time" &&
        q.lead_time_min_days !== undefined &&
        q.lead_time_max_days !== undefined
      ) {
        compare(
          "Quote lead time",
          plain(leadTimeText(q.lead_time_min_days, q.lead_time_max_days)),
          plain(leadTimeText(quote.lead_time_min_days, quote.lead_time_max_days)),
        );
      }
      if (choices.customs_value_basis === "quote_cost_of_goods") {
        compare("Quote cost of goods", usdText(q.cost_of_goods_usd), usdText(quote.cost_of_goods_usd));
      }
      compare("Forwarder's quoted duties", usdText(q.duties_taxes_usd), usdText(quote.duties_taxes_usd));
    }
  }
  return changes;
}

// ---- Comparison with the forwarder's quoted duties ------------------------------

// A difference is flagged "check with forwarder" when it's at least this many
// dollars AND at least this share of the higher of the two figures.
export const DUTY_DIFFERENCE_FLAG_USD = 100;
export const DUTY_DIFFERENCE_FLAG_SHARE = 0.15;

export type DutyComparison =
  | { kind: "not_quoted" }
  | {
      kind: "compared";
      quotedUsd: number;
      estimateUsd: number;
      // Forwarder minus estimate: positive when the forwarder quoted more.
      differenceUsd: number;
      flag: boolean;
    };

export function compareDuties(quotedUsd: number | null, estimateUsd: number): DutyComparison {
  if (quotedUsd == null) return { kind: "not_quoted" };
  const differenceUsd = centsToNumber(toCents(parseDecimal(quotedUsd)) - toCents(parseDecimal(estimateUsd)));
  const gap = Math.abs(differenceUsd);
  const flag =
    gap >= DUTY_DIFFERENCE_FLAG_USD && gap >= DUTY_DIFFERENCE_FLAG_SHARE * Math.max(quotedUsd, estimateUsd);
  return { kind: "compared", quotedUsd, estimateUsd, differenceUsd, flag };
}

import { z } from "zod";
import { CURRENCIES } from "@/lib/forwarder/project-fields";
import { isRealIsoDate } from "@/lib/forwarder/parse-quote-form";
import { SHIPMENT_MODES, type ShipmentMode } from "./calculate";
import { isOriginCountry } from "./countries";
import { parseEntryDate } from "./entry-date";
import { normalizeHtsCode } from "./hts-code";

// Validates the Tariff Calculator form. Amounts stay as decimal strings so
// the calculation is exact; bounds follow the duty_estimates columns.

export type EstimateFormData = {
  htsDigits: string;
  originCountry: string;
  shipmentMode: ShipmentMode;
  customsValue: string;
  currency: string;
  exchangeRate: string;
  // What the form claims; the server verifies it (verifyRateProvenance).
  exchangeRateSource: "daily_feed" | "manual" | null;
  exchangeRateDate: string | null;
  quantity: string | null;
  label: string | null;
  // The day the goods are expected to enter the US (UTC date); duty applies
  // on this day. Inside entryDateBounds(calculatedOn).
  entryDate: string;
  // USD taken off the converted value; only linked estimates set it
  // (parseLinkFields), so the plain calculator form always sends null.
  deductionUsd: string | null;
};

export type ParseEstimateResult =
  | { ok: true; data: EstimateFormData }
  | { ok: false; error: string };

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

// Positive decimal with at most `places` decimals and below `max`.
function positiveDecimal(value: string, places: number, max: number): boolean {
  if (!new RegExp(`^\\d+(\\.\\d{1,${places}})?$`).test(value)) return false;
  const n = Number(value);
  return n > 0 && n < max;
}

const currencySchema = z.enum(CURRENCIES);
const modeSchema = z.enum(SHIPMENT_MODES as [ShipmentMode, ...ShipmentMode[]]);

// `calculatedOn` is today (UTC), read once per request by the caller so the
// bounds here and in buildEstimate can't straddle midnight differently.
export function parseEstimateForm(formData: FormData, calculatedOn: string): ParseEstimateResult {
  const code = normalizeHtsCode(field(formData, "hts_code"));
  if (!code.ok) return { ok: false, error: code.error };

  const originCountry = field(formData, "origin_country").toUpperCase();
  if (!isOriginCountry(originCountry)) return { ok: false, error: "Choose the country of origin." };

  const mode = modeSchema.safeParse(field(formData, "shipment_mode"));
  if (!mode.success) return { ok: false, error: "Choose the shipment mode." };

  const customsValue = field(formData, "customs_value").replace(/,/g, "");
  // numeric(16,2)
  if (!positiveDecimal(customsValue, 2, 1e14)) {
    return { ok: false, error: "Enter the customs value as a positive amount, e.g. 10000.00." };
  }

  const currency = currencySchema.safeParse(field(formData, "original_currency") || "USD");
  if (!currency.success) return { ok: false, error: "Choose a currency from the list." };

  let exchangeRate = "1";
  let exchangeRateSource: EstimateFormData["exchangeRateSource"] = null;
  let exchangeRateDate: string | null = null;
  if (currency.data !== "USD") {
    exchangeRate = field(formData, "exchange_rate_to_usd");
    // numeric(20,10)
    if (!positiveDecimal(exchangeRate, 10, 1e10)) {
      return { ok: false, error: `Enter an exchange rate for ${currency.data} to USD.` };
    }
    const source = field(formData, "exchange_rate_source");
    exchangeRateSource = source === "daily_feed" ? "daily_feed" : "manual";
    const date = field(formData, "exchange_rate_date");
    exchangeRateDate = isRealIsoDate(date) ? date : null;
  }

  const quantityText = field(formData, "quantity").replace(/,/g, "");
  // numeric(16,4)
  if (quantityText !== "" && !positiveDecimal(quantityText, 4, 1e12)) {
    return { ok: false, error: "Enter the quantity as a positive number." };
  }

  const entry = parseEntryDate(field(formData, "entry_date"), calculatedOn);
  if (!entry.ok) return { ok: false, error: entry.error };

  const label = field(formData, "label");
  if (label.length > 200) return { ok: false, error: "Keep the reference under 200 characters." };

  return {
    ok: true,
    data: {
      htsDigits: code.digits,
      originCountry,
      shipmentMode: mode.data,
      customsValue,
      currency: currency.data,
      exchangeRate,
      exchangeRateSource,
      exchangeRateDate,
      quantity: quantityText === "" ? null : quantityText,
      label: label === "" ? null : label,
      entryDate: entry.date,
      deductionUsd: null,
    },
  };
}

// ---- Linked estimates ("Estimate duties" from Forwarder Sourcing) --------------

// Every input the user must tick as checked before a linked estimate is
// calculated or saved. The deduction and quantity are only asked when shown.
export const LINK_CONFIRMATIONS = {
  hts: "HTS code",
  origin: "country of origin",
  customs_value: "customs value",
  deduction: "freight and insurance deduction",
  mode: "shipment mode",
  entry_date: "expected entry date",
  quantity: "quantity",
} as const;
export type LinkConfirmation = keyof typeof LINK_CONFIRMATIONS;

export type LinkFields = {
  projectId: string;
  quoteId: string | null;
  // The project's (and quote's) updated_at when the page was loaded, so a
  // change made meanwhile is caught instead of saved into the snapshot.
  sourceVersion: string;
  deductionUsd: string | null;
  confirmed: Set<LinkConfirmation>;
};

export type ParseLinkResult = { linked: false } | { linked: true; data: LinkFields } | { error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LINK_ERROR = "This estimate's link to the project is invalid. Open it again from the project.";

export function parseLinkFields(formData: FormData): ParseLinkResult {
  const projectId = field(formData, "forwarder_project_id");
  if (projectId === "") return { linked: false };
  const quoteId = field(formData, "forwarder_quote_id");
  const sourceVersion = field(formData, "source_version");
  if (!UUID.test(projectId) || (quoteId !== "" && !UUID.test(quoteId)) || sourceVersion === "") {
    return { error: LINK_ERROR };
  }
  // The plain form treats a blank currency as USD; a linked one never assumes it.
  if (field(formData, "original_currency") === "") return { error: "Choose the currency of the customs value." };

  // Blank or zero means no deduction.
  const deductionText = field(formData, "freight_insurance_deduction_usd").replace(/,/g, "");
  let deductionUsd: string | null = null;
  if (deductionText !== "" && Number(deductionText) !== 0) {
    // numeric(14,2)
    if (!positiveDecimal(deductionText, 2, 1e12)) {
      return { error: "Enter the freight and insurance deduction in USD, e.g. 2500.00, or leave it blank." };
    }
    deductionUsd = deductionText;
  }

  const confirmed = new Set<LinkConfirmation>();
  for (const key of Object.keys(LINK_CONFIRMATIONS) as LinkConfirmation[]) {
    if (formData.get(`confirm_${key}`) === "on") confirmed.add(key);
  }
  return { linked: true, data: { projectId, quoteId: quoteId || null, sourceVersion, deductionUsd, confirmed } };
}

// The first required confirmation that's missing, as a message.
export function missingConfirmation(
  confirmed: Set<LinkConfirmation>,
  { deductionOffered, quantityEntered }: { deductionOffered: boolean; quantityEntered: boolean },
): string | null {
  const required: LinkConfirmation[] = ["hts", "origin", "customs_value"];
  if (deductionOffered) required.push("deduction");
  required.push("mode", "entry_date");
  if (quantityEntered) required.push("quantity");
  const missing = required.find((key) => !confirmed.has(key));
  return missing ? `Confirm the ${LINK_CONFIRMATIONS[missing]} before calculating.` : null;
}

import { z } from "zod";
import { CURRENCIES } from "@/lib/forwarder/project-fields";
import { isRealIsoDate } from "@/lib/forwarder/parse-quote-form";
import { SHIPMENT_MODES, type ShipmentMode } from "./calculate";
import { isOriginCountry } from "./countries";
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

export function parseEstimateForm(formData: FormData): ParseEstimateResult {
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
    },
  };
}

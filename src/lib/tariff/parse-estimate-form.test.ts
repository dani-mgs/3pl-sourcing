import { describe, expect, test } from "vitest";
import { parseEstimateForm } from "./parse-estimate-form";

function form(fields: Record<string, string>) {
  const data = new FormData();
  const defaults = {
    hts_code: "6402.99.31.10",
    origin_country: "VN",
    shipment_mode: "Sea",
    customs_value: "10000",
    original_currency: "USD",
  };
  for (const [key, value] of Object.entries({ ...defaults, ...fields })) data.set(key, value);
  return data;
}

describe("parseEstimateForm", () => {
  test("a USD estimate", () => {
    expect(parseEstimateForm(form({}))).toEqual({
      ok: true,
      data: {
        htsDigits: "6402993110",
        originCountry: "VN",
        shipmentMode: "Sea",
        customsValue: "10000",
        currency: "USD",
        exchangeRate: "1",
        exchangeRateSource: null,
        exchangeRateDate: null,
        quantity: null,
        label: null,
      },
    });
  });

  test("a non-USD estimate keeps the rate and what the form claims about it", () => {
    const result = parseEstimateForm(
      form({
        original_currency: "EUR",
        exchange_rate_to_usd: "1.0812345678",
        exchange_rate_source: "daily_feed",
        exchange_rate_date: "2026-10-01",
        quantity: "20,000",
        label: " Client A ",
      }),
    );
    expect(result).toMatchObject({
      ok: true,
      data: {
        currency: "EUR",
        exchangeRate: "1.0812345678",
        exchangeRateSource: "daily_feed",
        exchangeRateDate: "2026-10-01",
        quantity: "20000",
        label: "Client A",
      },
    });
  });

  test("a claim of any other rate source is treated as manual", () => {
    const result = parseEstimateForm(
      form({ original_currency: "EUR", exchange_rate_to_usd: "1.08", exchange_rate_source: "forwarder_document" }),
    );
    expect(result.ok && result.data.exchangeRateSource).toBe("manual");
  });

  test.each([
    [{ hts_code: "7208.10" }, /8- or 10-digit/],
    [{ origin_country: "US" }, /country of origin/],
    [{ origin_country: "XX" }, /country of origin/],
    [{ shipment_mode: "Rail" }, /shipment mode/],
    [{ customs_value: "0" }, /customs value/],
    [{ customs_value: "-5" }, /customs value/],
    [{ customs_value: "10000.123" }, /customs value/],
    [{ original_currency: "BTC" }, /currency/],
    [{ original_currency: "EUR", exchange_rate_to_usd: "" }, /exchange rate for EUR/],
    [{ quantity: "abc" }, /quantity/],
    [{ label: "x".repeat(201) }, /200 characters/],
  ])("refuses %j", (fields, message) => {
    const result = parseEstimateForm(form(fields as Record<string, string>));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toMatch(message);
  });
});

import { describe, expect, test } from "vitest";
import { missingConfirmation, parseEstimateForm, parseLinkFields } from "./parse-estimate-form";

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
        deductionUsd: null,
      },
    });
  });

  test("the plain calculator never takes a deduction, even if one is posted", () => {
    const result = parseEstimateForm(form({ freight_insurance_deduction_usd: "500" }));
    expect(result.ok && result.data.deductionUsd).toBeNull();
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

describe("parseLinkFields", () => {
  const PROJECT = "00000000-0000-4000-8000-000000000401";
  const QUOTE = "00000000-0000-4000-8000-000000000501";
  const linked = (fields: Record<string, string>) =>
    form({ forwarder_project_id: PROJECT, source_version: "2026-10-01T10:00:00Z", ...fields });

  test("no project: an ordinary calculator estimate", () => {
    expect(parseLinkFields(form({}))).toEqual({ linked: false });
  });

  test("reads the link, the deduction and the ticked confirmations", () => {
    const result = parseLinkFields(
      linked({
        forwarder_quote_id: QUOTE,
        freight_insurance_deduction_usd: "2,500.00",
        confirm_hts: "on",
        confirm_mode: "on",
        confirm_bogus: "on",
      }),
    );
    expect(result).toEqual({
      linked: true,
      data: {
        projectId: PROJECT,
        quoteId: QUOTE,
        sourceVersion: "2026-10-01T10:00:00Z",
        deductionUsd: "2500.00",
        confirmed: new Set(["hts", "mode"]),
      },
    });
  });

  test("a blank or zero deduction is no deduction", () => {
    for (const value of ["", "0", "0.00"]) {
      const result = parseLinkFields(linked({ freight_insurance_deduction_usd: value }));
      expect("data" in result && result.data.deductionUsd).toBeNull();
    }
  });

  test("a bad deduction or link is refused", () => {
    expect(parseLinkFields(linked({ freight_insurance_deduction_usd: "-5" }))).toMatchObject({ error: expect.any(String) });
    expect(parseLinkFields(linked({ freight_insurance_deduction_usd: "1.234" }))).toMatchObject({ error: expect.any(String) });
    expect(parseLinkFields(form({ forwarder_project_id: "not-a-uuid", source_version: "x" }))).toMatchObject({
      error: expect.stringMatching(/link/),
    });
    expect(parseLinkFields(form({ forwarder_project_id: PROJECT }))).toMatchObject({ error: expect.any(String) });
  });

  test("a linked estimate never assumes USD for a blank currency", () => {
    expect(parseLinkFields(linked({ original_currency: "" }))).toEqual({
      error: "Choose the currency of the customs value.",
    });
  });
});

describe("missingConfirmation", () => {
  const all = new Set(["hts", "origin", "customs_value", "mode"] as const);

  test("the four core inputs are always required", () => {
    expect(missingConfirmation(new Set(all), { deductionOffered: false, quantityEntered: false })).toBeNull();
    const noOrigin = new Set(all);
    noOrigin.delete("origin");
    expect(missingConfirmation(noOrigin, { deductionOffered: false, quantityEntered: false })).toBe(
      "Confirm the country of origin before calculating.",
    );
  });

  test("the deduction must be confirmed whenever it's offered, even if left blank", () => {
    expect(missingConfirmation(new Set(all), { deductionOffered: true, quantityEntered: false })).toBe(
      "Confirm the freight and insurance deduction before calculating.",
    );
  });

  test("a quantity must be confirmed when one is entered", () => {
    expect(missingConfirmation(new Set(all), { deductionOffered: false, quantityEntered: true })).toBe(
      "Confirm the quantity before calculating.",
    );
  });
});

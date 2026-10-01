import { afterEach, describe, expect, test, vi } from "vitest";
import { parseQuoteForm } from "./parse-quote-form";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  data.set("scenario_group", "SHA-RTM-FCL");
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

describe("parseQuoteForm exchange rate", () => {
  test("rejects a non-USD quote with a blank rate", () => {
    const result = parseQuoteForm(form({ original_currency: "EUR", original_amount: "4550", exchange_rate_to_usd: "" }));
    expect(result).toEqual({ ok: false, error: "Enter an exchange rate to USD for this EUR quote." });
  });

  test("rejects a non-USD quote with a whitespace-only or missing rate", () => {
    expect(parseQuoteForm(form({ original_currency: "CNY", exchange_rate_to_usd: "   " })).ok).toBe(false);
    expect(parseQuoteForm(form({ original_currency: "CNY" })).ok).toBe(false);
  });

  test("accepts a non-USD quote with an entered rate, including exactly 1", () => {
    const entered = parseQuoteForm(form({ original_currency: "EUR", exchange_rate_to_usd: "1.09" }));
    expect(entered.ok && entered.data.exchange_rate_to_usd).toBe(1.09);
    const one = parseQuoteForm(form({ original_currency: "EUR", exchange_rate_to_usd: "1" }));
    expect(one.ok && one.data.exchange_rate_to_usd).toBe(1);
  });

  test("USD, or a blank currency (saved as USD), still defaults a blank rate to 1", () => {
    const usd = parseQuoteForm(form({ original_currency: "USD", exchange_rate_to_usd: "" }));
    expect(usd.ok && usd.data.exchange_rate_to_usd).toBe(1);
    const blank = parseQuoteForm(form({ original_currency: "", exchange_rate_to_usd: "" }));
    expect(blank.ok && [blank.data.original_currency, blank.data.exchange_rate_to_usd]).toEqual(["USD", 1]);
  });

  test("a zero or negative rate is still refused by the schema", () => {
    expect(parseQuoteForm(form({ original_currency: "EUR", exchange_rate_to_usd: "0" })).ok).toBe(false);
    expect(parseQuoteForm(form({ original_currency: "EUR", exchange_rate_to_usd: "-1" })).ok).toBe(false);
  });
});

afterEach(() => vi.restoreAllMocks());
const quietErrors = () => vi.spyOn(console, "error").mockImplementation(() => {});

describe("parseQuoteForm fields", () => {
  test("a valid quote parses numbers, trims text, and keeps a fitting mode/type pair", () => {
    const result = parseQuoteForm(
      form({
        shipment_mode: "Air",
        shipment_type: "Courier",
        incoterm: "DAP",
        origin: "  Shenzhen ",
        original_amount: "1234.5",
        lead_time_min_days: "3",
        quote_completeness: "Complete / Comparable",
        client_decision: "Pending",
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toMatchObject({
      shipment_mode: "Air",
      shipment_type: "Courier",
      incoterm: "DAP",
      origin: "Shenzhen",
      original_amount: 1234.5,
      lead_time_min_days: 3,
      original_currency: "USD",
      exchange_rate_to_usd: 1,
    });
  });

  test("a type that doesn't fit the mode is refused", () => {
    expect(parseQuoteForm(form({ shipment_mode: "Sea", shipment_type: "Air Freight" }))).toEqual({
      ok: false,
      error: "The shipment type doesn't match the shipment mode.",
    });
  });

  test("a type without a mode is refused", () => {
    expect(parseQuoteForm(form({ shipment_type: "FCL" })).ok).toBe(false);
  });

  test("missing scenario group is refused with its own message", () => {
    quietErrors();
    const data = form({});
    data.set("scenario_group", "  ");
    expect(parseQuoteForm(data)).toEqual({ ok: false, error: "Scenario group is required." });
  });

  test.each([
    ["incoterm", "FOB Shanghai"],
    ["shipment_mode", "Ocean"],
    ["original_currency", "BTC"],
    ["quote_completeness", "Mostly"],
    ["overall_assessment", "Great"],
    ["client_decision", "Maybe"],
    ["exchange_rate_source", "guess"],
  ])("an unknown %s is refused", (field, value) => {
    quietErrors();
    expect(parseQuoteForm(form({ [field]: value, exchange_rate_to_usd: "1.1" })).ok).toBe(false);
  });

  test.each([
    ["original_amount", "-1"],
    ["original_amount", "1e14"],
    ["lead_time_max_days", "100000"],
    ["cbm", "100000000"],
    ["duties_taxes_usd", "abc"],
  ])("%s = %s is out of range", (field, value) => {
    quietErrors();
    expect(parseQuoteForm(form({ [field]: value })).ok).toBe(false);
  });

  test("values just inside the column limits are accepted", () => {
    expect(parseQuoteForm(form({ original_amount: "99999999999999.99", lead_time_max_days: "99999.9" })).ok).toBe(true);
  });
});

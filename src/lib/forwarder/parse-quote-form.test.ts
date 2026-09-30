import { describe, expect, test } from "vitest";
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

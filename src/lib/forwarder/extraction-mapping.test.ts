import { describe, expect, test } from "vitest";
import {
  pickEnum,
  toExtractedForwarderFields,
  toExtractedQuoteFields,
  toForwarderProjectFields,
} from "./extraction-mapping";
import { mergeForwarderFields } from "./merge-forwarder-fields";
import { INCOTERMS } from "./project-fields";

const PLACEHOLDERS = ["N/A", "Unknown", "<UNKNOWN>", "not specified", "", "   "];

describe("pickEnum", () => {
  test("keeps an allowed value, drops anything else", () => {
    expect(pickEnum("FOB", INCOTERMS)).toBe("FOB");
    expect(pickEnum("fob", INCOTERMS)).toBeNull();
    expect(pickEnum("Free on board", INCOTERMS)).toBeNull();
    expect(pickEnum(undefined, INCOTERMS)).toBeNull();
  });
});

describe("toExtractedForwarderFields", () => {
  test.each(PLACEHOLDERS)("placeholder %j becomes null, never form text", (filler) => {
    const fields = toExtractedForwarderFields({ email: filler, headquarters: filler });
    expect(fields.email).toBeNull();
    expect(fields.headquarters).toBeNull();
  });

  test("real text is kept, trimmed; company name and pipeline fields are never produced", () => {
    const fields = toExtractedForwarderFields({
      email: "  ops@acme.example ",
      company_name: "Acme",
      status: "Vetted",
    } as never);
    expect(fields.email).toBe("ops@acme.example");
    expect(fields).not.toHaveProperty("company_name");
    expect(fields).not.toHaveProperty("status");
  });

  test("capabilities pass through only as real booleans", () => {
    const fields = toExtractedForwarderFields({ air_freight: true, sea_freight: false, fcl: "yes" } as never);
    expect(fields.air_freight).toBe(true);
    expect(fields.sea_freight).toBe(false);
    expect(fields).not.toHaveProperty("fcl");
  });

  test("end to end: filler from the model never replaces an existing value", () => {
    const current = { email: "jane@acme.example", headquarters: "Rotterdam" };
    const { merged, changed } = mergeForwarderFields(
      current,
      toExtractedForwarderFields({ email: "N/A", headquarters: "Unknown" }),
    );
    expect(merged).toMatchObject(current);
    expect([...changed]).toEqual([]);
  });
});

describe("toExtractedQuoteFields", () => {
  test.each(PLACEHOLDERS)("placeholder %j becomes null (or undefined for scenario group)", (filler) => {
    const fields = toExtractedQuoteFields(
      { origin: filler, quote_reference: filler, scenario_group: filler },
      [],
    );
    expect(fields.origin).toBeNull();
    expect(fields.quote_reference).toBeNull();
    expect(fields.scenario_group).toBeUndefined();
  });

  test("a USD quote's stated rate is discarded; a non-USD rate is kept", () => {
    expect(
      toExtractedQuoteFields({ original_currency: "USD", exchange_rate_to_usd: 0.9 }, [])
        .exchange_rate_to_usd,
    ).toBeUndefined();
    expect(
      toExtractedQuoteFields({ original_currency: "EUR", exchange_rate_to_usd: 1.08 }, [])
        .exchange_rate_to_usd,
    ).toBe(1.08);
  });

  test("a missing rate stays missing (never 1)", () => {
    expect(toExtractedQuoteFields({ original_currency: "EUR" }, []).exchange_rate_to_usd).toBeUndefined();
  });

  test("unknown currency, mode, or incoterm is dropped; bad dates are dropped", () => {
    const fields = toExtractedQuoteFields(
      {
        original_currency: "Euros",
        shipment_mode: "Ocean",
        incoterm: "FOB Shanghai",
        quote_date: "30/09/2026",
        rate_valid_until: "2026-10-31",
      },
      [],
    );
    expect(fields.original_currency).toBeUndefined();
    expect(fields.shipment_mode).toBeNull();
    expect(fields.incoterm).toBeNull();
    expect(fields.quote_date).toBeNull();
    expect(fields.rate_valid_until).toBe("2026-10-31");
  });

  test("never produces the user's own judgment fields", () => {
    const fields = toExtractedQuoteFields(
      { quote_completeness: "Complete", overall_assessment: "Strong", client_decision: "Go" } as never,
      [],
    );
    expect(fields).not.toHaveProperty("quote_completeness");
    expect(fields).not.toHaveProperty("overall_assessment");
    expect(fields).not.toHaveProperty("client_decision");
  });
});

describe("toForwarderProjectFields", () => {
  test.each(PLACEHOLDERS)("placeholder %j becomes null", (filler) => {
    const fields = toForwarderProjectFields({ origin_city: filler, hs_code: filler });
    expect(fields.origin_city).toBeNull();
    expect(fields.hs_code).toBeNull();
  });

  test("option fields keep only allowed values; incoterms are filtered and put in canonical order", () => {
    const fields = toForwarderProjectFields({
      stackable: "Maybe",
      insurance_required: "Yes",
      incoterms_to_compare: ["DDP", "Bogus", "EXW"],
    });
    expect(fields.stackable).toBeNull();
    expect(fields.insurance_required).toBe("Yes");
    expect(fields.incoterms_to_compare).toEqual(["EXW", "DDP"]);
  });

  test("never produces status", () => {
    expect(toForwarderProjectFields({ status: "Completed" } as never)).not.toHaveProperty("status");
  });
});

import { afterEach, describe, expect, test, vi } from "vitest";
import { parseForwarderProjectForm } from "./parse-project-form";
import {
  SHIPMENT_MODES,
  SHIPMENT_TYPES,
  SHIPMENT_TYPES_BY_MODE,
  isTypeAllowedForMode,
} from "./project-fields";

function form(entries: Record<string, string | string[]>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    for (const v of Array.isArray(value) ? value : [value]) fd.append(key, v);
  }
  return fd;
}

// Validation failures are logged server-side; keep test output quiet.
const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
afterEach(() => errorSpy.mockClear());

describe("parseForwarderProjectForm", () => {
  test("blank form: every field null, status Active, no incoterms", () => {
    const result = parseForwarderProjectForm(form({ origin_country: "  " }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.status).toBe("Active");
    expect(result.data.origin_country).toBeNull();
    expect(result.data.weight_kg).toBeNull();
    expect(result.data.incoterms_to_compare).toEqual([]);
  });

  test("keeps HS code leading zeros and parses numbers", () => {
    const result = parseForwarderProjectForm(
      form({
        hs_code: "0102.29",
        weight_kg: "1234.567",
        cbm: "12.345678",
        pallets: "4",
        shipments_per_month: "2.5",
        current_freight_cost_usd: "7792.81",
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.hs_code).toBe("0102.29");
    expect(result.data.weight_kg).toBe(1234.567);
    expect(result.data.cbm).toBe(12.345678);
    expect(result.data.pallets).toBe(4);
    expect(result.data.shipments_per_month).toBe(2.5);
    expect(result.data.current_freight_cost_usd).toBe(7792.81);
  });

  test("incoterms to compare: de-duplicated and in canonical order", () => {
    const result = parseForwarderProjectForm(
      form({ incoterms_to_compare: ["DDP", "FOB", "DDP", "DDU (legacy term)"] }),
    );
    expect(result.ok && result.data.incoterms_to_compare).toEqual([
      "FOB",
      "DDP",
      "DDU (legacy term)",
    ]);
  });

  test.each([
    ["an unknown incoterm", { current_incoterm: "XYZ" }],
    ["an unknown incoterm in the compare list", { incoterms_to_compare: ["FOB", "XYZ"] }],
    ["an unknown status", { status: "Archived" }],
    ["an unknown Yes/No value", { dangerous_goods: "Maybe" }],
    ["an unknown currency", { invoice_currency: "BTC" }],
    ["a negative number", { weight_kg: "-1" }],
    ["text in a number field", { cbm: "abc" }],
    ["a fractional integer", { pallets: "2.5" }],
    ["a number too big for its column", { current_lead_time_days: "100000" }],
  ])("rejects %s with a generic message", (_label, entries) => {
    const result = parseForwarderProjectForm(form(entries));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe(
      "Some fields have values that aren't allowed. Check the form and try again.",
    );
  });

  test("rejects a current type that doesn't fit the current mode", () => {
    const result = parseForwarderProjectForm(
      form({ shipment_mode: "Sea", shipment_type: "Air Freight" }),
    );
    expect(result).toEqual({
      ok: false,
      error: "The current shipment type doesn't match the current shipment mode.",
    });
  });

  test("rejects a final type without a final mode", () => {
    const result = parseForwarderProjectForm(form({ final_shipment_type: "FCL" }));
    expect(result).toEqual({
      ok: false,
      error: "The final shipment type doesn't match the final shipment mode.",
    });
  });

  test("accepts Courier under Road", () => {
    const result = parseForwarderProjectForm(
      form({ shipment_mode: "Road", shipment_type: "Courier" }),
    );
    expect(result.ok).toBe(true);
  });
});

describe("SHIPMENT_TYPES_BY_MODE", () => {
  test("covers every mode, and every type belongs to at least one mode", () => {
    expect(Object.keys(SHIPMENT_TYPES_BY_MODE).sort()).toEqual([...SHIPMENT_MODES].sort());
    const mapped = new Set(Object.values(SHIPMENT_TYPES_BY_MODE).flat());
    for (const type of SHIPMENT_TYPES) expect(mapped.has(type)).toBe(true);
  });

  test("isTypeAllowedForMode", () => {
    expect(isTypeAllowedForMode("Air", "Courier")).toBe(true);
    expect(isTypeAllowedForMode("Sea", "Courier")).toBe(false);
    expect(isTypeAllowedForMode(null, null)).toBe(true);
    expect(isTypeAllowedForMode("Sea", null)).toBe(true);
    expect(isTypeAllowedForMode(null, "FCL")).toBe(false);
  });
});

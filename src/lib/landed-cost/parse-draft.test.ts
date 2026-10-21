import { describe, expect, test } from "vitest";
import { createPayload, parseCreateWorkspace, parseDraft, savePayload, type Draft } from "./parse-draft";

// The draft parser: what the browser sends is normalised to what the tables
// store (and the duty loader reads), every bound is the tables' own, and the
// caps are enforced before anything reaches the database.

const L1 = "00000000-0000-4000-8000-000000000101";
const S1 = "00000000-0000-4000-8000-000000000201";

const line = (over: Record<string, unknown> = {}) => ({
  ref: L1, id: L1, skuCode: "SKU-001", description: "", htsCode: "6402.99.31.10", quantity: "100",
  dutyQuantity: "", dutyQuantityUnit: "", ...over,
});
const scenario = (over: Record<string, unknown> = {}) => ({
  ref: S1, id: S1, label: "China", originCountry: "CN", supplierName: "", incoterm: "FOB", shipmentMode: "Sea",
  entryType: "formal", freightTotalUsd: "854.00", freightBasis: "chargeable_weight", volumetricDivisor: "",
  items: [{ skuRef: L1, fobUnitPriceUsd: "6.00" }], otherCosts: [], ...over,
});
const draft = (over: Record<string, unknown> = {}) => ({
  name: "Q4 sourcing", entryDate: "2026-11-01", baselineRef: S1, skuLines: [line()], scenarios: [scenario()], ...over,
});

function ok(input: unknown): Draft {
  const result = parseDraft(input);
  if (!result.ok) throw new Error(`${result.error} ${JSON.stringify(result.issues)}`);
  return result.data;
}
function error(input: unknown): string[] {
  const result = parseDraft(input);
  if (result.ok) throw new Error("expected the draft to be refused");
  return result.issues.map((i) => i.message);
}

describe("normalising", () => {
  test("HTS to digits, origin upper case, unit to its token, numbers without commas", () => {
    const d = ok(
      draft({
        skuLines: [line({ htsCode: " 6402.99.31.10 ", quantity: "1,000", dutyQuantity: " 1,234.5 ", dutyQuantityUnit: "  clean   kg " })],
        scenarios: [scenario({ originCountry: " cn ", freightTotalUsd: "1,053.00", volumetricDivisor: "6000" })],
      }),
    );
    expect(d.skuLines[0]).toMatchObject({ htsCode: "6402993110", quantity: "1000", dutyQuantity: "1234.5", dutyQuantityUnit: "clean kg" });
    expect(d.scenarios[0]).toMatchObject({ originCountry: "CN", freightTotalUsd: "1053.00", volumetricDivisor: "6000" });
  });

  test("labels are trimmed as JavaScript's trim() does (no-break and ideographic spaces too)", () => {
    const d = ok(draft({ name: "  Q4 sourcing　", scenarios: [scenario({ label: "\tChina\n" })] }));
    expect(d.name).toBe("Q4 sourcing");
    expect(d.scenarios[0].label).toBe("China");
  });

  test("lengths are JavaScript's .length: an emoji counts twice", () => {
    expect(ok(draft({ skuLines: [line({ skuCode: "😀".repeat(30) })] })).skuLines[0].skuCode).toHaveLength(60);
    expect(error(draft({ skuLines: [line({ skuCode: "😀".repeat(30) + "x" })] }))).toContain("Enter a SKU code of 1 to 60 characters.");
  });

  test("blank optional fields are null, never empty strings", () => {
    const d = ok(draft({ scenarios: [scenario({ freightTotalUsd: " ", items: [{ skuRef: L1, fobUnitPriceUsd: "" }] })] }));
    expect(d.skuLines[0]).toMatchObject({ description: null, dutyQuantity: null, dutyQuantityUnit: null });
    expect(d.scenarios[0]).toMatchObject({ supplierName: null, freightTotalUsd: null, volumetricDivisor: null });
    expect(d.scenarios[0].items[0]).toMatchObject({ fobUnitPriceUsd: null, pcsPerCarton: null, cartonGrossKg: null });
  });

  test("the payload uses the functions' keys, numbers stay strings, order becomes sort_order", () => {
    const d = ok(
      draft({
        skuLines: [line(), line({ ref: "new-1", id: null, skuCode: "SKU-002" })],
        scenarios: [scenario({ otherCosts: [{ label: " Broker fee ", amountUsd: "95" }] })],
      }),
    );
    const p = savePayload(d);
    expect(p.sku_lines[0]).toEqual({
      ref: L1, id: L1, sku_code: "SKU-001", description: null, hts_code: "6402993110", quantity: "100",
      duty_quantity: null, duty_quantity_unit: null, sort_order: 0,
    });
    expect(p.sku_lines[1]).not.toHaveProperty("id");
    expect(p.sku_lines[1].sort_order).toBe(1);
    expect(p.scenarios[0].items[0]).toEqual({
      sku_ref: L1, fob_unit_price_usd: "6.00", pcs_per_carton: null, carton_length_cm: null, carton_width_cm: null,
      carton_height_cm: null, carton_gross_kg: null,
    });
    expect(p.scenarios[0].other_costs).toEqual([{ label: "Broker fee", amount_usd: "95", sort_order: 0 }]);
  });
});

describe("values the calculation would refuse", () => {
  test("a FOB price of 0 is refused, with a clear message", () => {
    expect(error(draft({ scenarios: [scenario({ items: [{ skuRef: L1, fobUnitPriceUsd: "0.0000" }] })] }))).toContain(
      "Enter a FOB price above $0.00.",
    );
  });

  test("qty x FOB must round to more than $0.00 and less than $100 trillion", () => {
    const tiny = draft({ skuLines: [line({ quantity: "1" })], scenarios: [scenario({ items: [{ skuRef: L1, fobUnitPriceUsd: "0.0001" }] })] });
    expect(error(tiny)[0]).toMatch(/SKU-001 in China: quantity × FOB price must come to more than \$0\.00/);
    const huge = draft({ skuLines: [line({ quantity: "999999999999" })], scenarios: [scenario({ items: [{ skuRef: L1, fobUnitPriceUsd: "200" }] })] });
    expect(error(huge)[0]).toMatch(/less than \$100 trillion/);
    ok(draft({ skuLines: [line({ quantity: "499999999999" })], scenarios: [scenario({ items: [{ skuRef: L1, fobUnitPriceUsd: "200" }] })] }));
  });

  test.each([
    ["too many FOB decimals", { items: [{ skuRef: L1, fobUnitPriceUsd: "6.00001" }] }, "Enter the FOB price in USD with up to 4 decimals, e.g. 6.25."],
    ["a carton cm with 3 decimals", { items: [{ skuRef: L1, fobUnitPriceUsd: "6", cartonLengthCm: "40.125" }] }, "Enter the carton length in cm, above zero with up to 2 decimals."],
    ["a carton kg of 0", { items: [{ skuRef: L1, fobUnitPriceUsd: "6", cartonGrossKg: "0" }] }, "Enter the carton weight in kg, above zero with up to 3 decimals."],
    ["a divisor of 1,000,000", { volumetricDivisor: "1000000" }, "Enter the divisor above zero and below 1,000,000, with up to 3 decimals, or leave it blank."],
    ["freight with 3 decimals", { freightTotalUsd: "854.001" }, "Enter the freight total in USD as 0 or more, e.g. 854.00."],
    ["a delivered incoterm", { incoterm: "DDP" }, "Choose EXW, FCA, FAS or FOB."],
    ["the US as origin", { originCountry: "US" }, "Choose the country of origin."],
  ])("%s", (_name, over, message) => {
    expect(error(draft({ scenarios: [scenario(over)] }))).toContain(message);
  });

  test("a chapter 99 HTS code, a quantity of 0, a unit that isn't a rate unit, a duty quantity without a unit", () => {
    expect(error(draft({ skuLines: [line({ htsCode: "9903.88.03" })] }))[0]).toMatch(/Chapter 98 and 99/);
    expect(error(draft({ skuLines: [line({ quantity: "0" })] }))).toContain("Enter the quantity as a whole number from 1 to 999,999,999,999.");
    expect(error(draft({ skuLines: [line({ dutyQuantity: "5", dutyQuantityUnit: "KG" })] }))).toContain("Choose the duty quantity's unit from the list.");
    expect(error(draft({ skuLines: [line({ dutyQuantity: "5" })] }))).toContain("Enter the duty quantity together with its unit, or neither.");
  });
});

describe("caps and rows, before any database call", () => {
  const lines = (n: number) => Array.from({ length: n }, (_, i) => line({ ref: `l${i}`, id: null, skuCode: `SKU-${i}` }));
  const scenarios = (n: number) =>
    Array.from({ length: n }, (_, i) => scenario({ ref: `s${i}`, id: null, label: `S${i}`, items: [] }));

  test("at most 100 SKU lines, at least 1 and at most 5 scenarios, at most 20 other costs", () => {
    ok(draft({ skuLines: lines(100), scenarios: [scenario({ items: [] })] }));
    expect(error(draft({ skuLines: lines(101), scenarios: [scenario({ items: [] })] }))).toContain("A workspace can have at most 100 SKU lines.");
    expect(error(draft({ scenarios: [], baselineRef: "x" }))).toContain("A workspace needs at least one scenario.");
    ok(draft({ scenarios: scenarios(5), baselineRef: "s0" }));
    expect(error(draft({ scenarios: scenarios(6), baselineRef: "s0" }))).toContain("A workspace can have at most 5 scenarios.");
    const costs = (n: number) => Array.from({ length: n }, (_, i) => ({ label: `Cost ${i}`, amountUsd: "1" }));
    ok(draft({ scenarios: [scenario({ otherCosts: costs(20) })] }));
    expect(error(draft({ scenarios: [scenario({ otherCosts: costs(21) })] }))).toContain("A scenario can have at most 20 other costs.");
  });

  test("at most one item per SKU line in a scenario", () => {
    const twice = [{ skuRef: L1, fobUnitPriceUsd: "6" }, { skuRef: L1, fobUnitPriceUsd: "7" }];
    expect(error(draft({ scenarios: [scenario({ items: twice })] }))).toContain("SKU-001 has more than one set of inputs in China.");
  });

  test("SKU codes and scenario labels are unique; refs resolve; the baseline is one of the scenarios", () => {
    expect(error(draft({ skuLines: [line(), line({ ref: "x", id: null })] }))).toContain('The SKU code "SKU-001" is used more than once.');
    expect(error(draft({ scenarios: [scenario(), scenario({ ref: "x", id: null })] }))).toContain(
      'The scenario label "China" is used more than once.',
    );
    expect(error(draft({ scenarios: [scenario({ items: [{ skuRef: "gone", fobUnitPriceUsd: "6" }] })] }))).toContain(
      "This item's SKU line isn't in the workspace. Reload the workspace.",
    );
    expect(error(draft({ baselineRef: "nope" }))).toContain("Choose the baseline scenario.");
  });
});

describe("a new workspace", () => {
  const input = { name: " New ", entryDate: "2026-11-01", scenario: { ...scenario(), ref: undefined, id: undefined } };

  test("is parsed into the create function's payload", () => {
    const result = parseCreateWorkspace(input, "2026-10-21");
    if (!result.ok) throw new Error(result.error);
    expect(createPayload(result.data)).toEqual({
      name: "New",
      entry_date: "2026-11-01",
      scenario: {
        label: "China", origin_country: "CN", supplier_name: null, incoterm: "FOB", shipment_mode: "Sea", entry_type: "formal",
        freight_total_usd: "854.00", freight_basis: "chargeable_weight", volumetric_divisor: null,
      },
    });
  });

  test("needs an entry date in range now (a saved draft's may age)", () => {
    const result = parseCreateWorkspace({ ...input, entryDate: "2026-10-01" }, "2026-10-21");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/can't be earlier than/);
    expect(parseDraft(draft({ entryDate: "2026-10-01" })).ok).toBe(true);
  });
});

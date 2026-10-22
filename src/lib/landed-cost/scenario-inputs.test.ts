import { describe, expect, test } from "vitest";
import { fromInteger } from "@/lib/tariff/rational";
import { divisorFor, dutyLines, prepareScenario } from "./scenario-inputs";
import type { Scenario, SkuLine } from "./workspace-schema";

// Required inputs and measures for one scenario of a saved workspace.

const line: SkuLine = { id: "l1", skuCode: "SKU-001", description: null, htsCode: "6402993110", quantity: "15", dutyQuantity: null };
const scenario = (over: Partial<Scenario> = {}): Scenario => ({
  id: "s1", label: "Mexico", originCountry: "MX", supplierName: null, incoterm: "FCA", shipmentMode: "Road", entryType: "auto",
  freightTotalUsd: "100", freightBasis: "chargeable_weight", volumetricDivisor: null, isBaseline: true, otherCosts: [],
  items: [{ skuLineId: "l1", fobUnitPriceUsd: "0.333", pcsPerCarton: "10", cartonLengthCm: "100", cartonWidthCm: "100", cartonHeightCm: "100", cartonGrossKg: "2", overrides: [] }],
  ...over,
});

describe("divisorFor", () => {
  test("blank takes the mode's default; Road has none", () => {
    expect(divisorFor("Air", null)).toBe("6000");
    expect(divisorFor("Sea", null)).toBe("1000");
    expect(divisorFor("Road", null)).toBeNull();
    expect(divisorFor("Air", "5000")).toBe("5000");
  });
});

describe("prepareScenario", () => {
  test("Road with no divisor: chargeable weight is the actual weight (2 cartons x 2 kg), however bulky", () => {
    const [sku] = prepareScenario([line], scenario()).skus;
    expect(sku.measures?.volumetricKg).toBeNull();
    expect(sku.measures?.chargeableKg).toEqual(fromInteger(4));
    expect(sku.missing).toEqual([]);
  });

  test("the entered value is qty x FOB rounded half up to the cent, and is what the duty loader gets", () => {
    const prepared = prepareScenario([line], scenario());
    expect(prepared.skus[0].enteredValueUsd).toBe("5.00"); // 15 x 0.333 = 4.995
    expect(dutyLines(prepared)).toEqual([
      { lineId: "s1:l1", htsCode: "6402993110", originCountry: "MX", enteredValueUsd: "5.00", dutyQuantity: null, dutyQuantityUnit: null },
    ]);
  });

  test("no FOB price: no duty line; units basis needs no packing", () => {
    const prepared = prepareScenario([line], scenario({ freightBasis: "units", items: [] }));
    expect(prepared.skus[0].missing).toEqual(["fob_unit_price_usd"]);
    expect(dutyLines(prepared)).toEqual([]);
  });
});

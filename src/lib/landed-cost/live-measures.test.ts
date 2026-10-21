import { describe, expect, test } from "vitest";
import { parseDecimal } from "@/lib/tariff/rational";
import { newSkuRow, type SkuRow } from "./editor-draft";
import { decimalText, liveMeasures, liveShipment } from "./live-measures";

// The live cartons and weights shown while packing is typed (display only).

const row = (over: Partial<SkuRow> = {}): SkuRow => ({
  ...newSkuRow("r1"),
  quantity: "100", pcsPerCarton: "20", cartonLengthCm: "60", cartonWidthCm: "40", cartonHeightCm: "31", cartonGrossKg: "10",
  ...over,
});

describe("liveMeasures", () => {
  test("the reference case: 5 cartons, 0.372 m³, 50 kg actual, 62 kg volumetric (Air 6,000) is chargeable", () => {
    expect(liveMeasures(row(), "Air", "")).toEqual({
      cartons: "5", partial: null, cbm: "0.372", actualKg: "50.0", volumetricKg: "62.0", chargeableKg: "62.0", chargeableBasis: "volumetric",
    });
  });

  test("a partial last carton is named", () => {
    expect(liveMeasures(row({ quantity: "105" }), "Sea", "")).toMatchObject({ cartons: "6", partial: "Last carton holds 5 of 20 pcs" });
  });

  test("Road with no divisor: no volumetric weight, chargeable is actual", () => {
    expect(liveMeasures(row(), "Road", "")).toMatchObject({ volumetricKg: null, chargeableKg: "50.0", chargeableBasis: "actual" });
  });

  test("a typed divisor replaces the default; thousands commas in counts are fine", () => {
    expect(liveMeasures(row({ quantity: "1,000" }), "Air", "5000")).toMatchObject({ cartons: "50", volumetricKg: "744.0" });
  });

  test("nothing until every packing field is valid", () => {
    expect(liveMeasures(row({ cartonGrossKg: "" }), "Sea", "")).toBeNull();
    expect(liveMeasures(row({ cartonLengthCm: "abc" }), "Sea", "")).toBeNull();
  });
});

describe("liveShipment and decimalText", () => {
  test("totals once every row can be measured", () => {
    expect(liveShipment([row(), row({ ref: "r2" })], "Air", "")).toMatchObject({ cartons: "10", cbm: "0.744", chargeableKg: "124.0" });
    expect(liveShipment([row(), row({ ref: "r2", pcsPerCarton: "" })], "Air", "")).toBeNull();
    expect(liveShipment([], "Air", "")).toBeNull();
  });

  test("thousands separators and half-up rounding", () => {
    expect(decimalText(parseDecimal("1234567.25"), 1)).toBe("1,234,567.3");
    expect(decimalText(parseDecimal("999"), 0)).toBe("999");
  });
});

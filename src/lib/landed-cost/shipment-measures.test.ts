import { describe, expect, test } from "vitest";
import { toFixed } from "@/lib/tariff/rational";
import {
  AIR_CARGO_DIVISOR,
  COURIER_DIVISOR,
  DIVISOR_DEFAULTS,
  SEA_KG_PER_CBM,
  measureSkuLine,
  shipmentTotals,
  type SkuMeasures,
  type SkuMeasuresInput,
} from "./shipment-measures";

const CARTON: SkuMeasuresInput = { quantity: "100", pcsPerCarton: "20", lengthCm: "60", widthCm: "40", heightCm: "31", cartonKg: "10" };

function measure(input: Partial<SkuMeasuresInput>, mode: "Air" | "Sea" | "Road" = "Air", divisor: string | null = "6000"): SkuMeasures {
  const result = measureSkuLine({ ...CARTON, ...input }, { mode, divisor });
  if (!result.ok) throw new Error(result.error);
  return result.measures;
}

describe("divisor defaults", () => {
  test("air cargo 6000, courier 5000 (both Air), sea 1000, road none", () => {
    expect([AIR_CARGO_DIVISOR, COURIER_DIVISOR, SEA_KG_PER_CBM]).toEqual([6000, 5000, 1000]);
    expect(DIVISOR_DEFAULTS.map((d) => [d.key, d.mode, d.divisor])).toEqual([
      ["air_cargo", "Air", 6000],
      ["courier", "Air", 5000],
      ["sea", "Sea", 1000],
      ["road", "Road", null],
    ]);
    for (const d of DIVISOR_DEFAULTS) expect(d.label.length).toBeGreaterThan(0);
  });
});

describe("cartons", () => {
  test("105 pcs at 20 per carton is 6 cartons, the last one partial with 5 pcs", () => {
    const m = measure({ quantity: "105" });
    expect(m.cartons).toBe(BigInt(6));
    expect(m.partialCarton).toBe(true);
    expect(m.pcsInLastCarton).toBe(BigInt(5));
  });

  test("an exact multiple has no partial carton", () => {
    const m = measure({ quantity: "100" });
    expect([m.cartons, m.partialCarton, m.pcsInLastCarton]).toEqual([BigInt(5), false, BigInt(20)]);
  });

  test("a partial carton counts as a full one for weight and volume", () => {
    const m = measure({ quantity: "105" });
    expect(toFixed(m.actualKg, 3)).toBe("60.000");
    expect(toFixed(m.totalCbm, 6)).toBe("0.446400");
  });
});

describe("weights", () => {
  test("5 cartons of 60 × 40 × 31 cm, 10 kg each, Air 6000: chargeable is the volumetric 62.0 kg", () => {
    const m = measure({ quantity: "100" });
    expect(toFixed(m.cartonCbm, 4)).toBe("0.0744");
    expect(toFixed(m.totalCbm, 3)).toBe("0.372");
    expect(toFixed(m.actualKg, 1)).toBe("50.0");
    expect(toFixed(m.volumetricKg!, 1)).toBe("62.0");
    expect(toFixed(m.chargeableKg, 1)).toBe("62.0");
    expect(m.chargeableBasis).toBe("volumetric");
    expect(m.seaBasis).toBeNull();
  });

  test("courier 5000 gives a larger volumetric weight", () => {
    expect(toFixed(measure({}, "Air", "5000").volumetricKg!, 2)).toBe("74.40");
  });

  test("heavy cartons: the actual weight applies", () => {
    const m = measure({ cartonKg: "20" });
    expect(m.chargeableBasis).toBe("actual");
    expect(toFixed(m.chargeableKg, 1)).toBe("100.0");
  });

  test("a tie counts as actual weight", () => {
    // 12.4 kg per carton equals the volumetric 74,400 / 6,000.
    expect(measure({ cartonKg: "12.4" }).chargeableBasis).toBe("actual");
  });

  test("Road with no divisor: chargeable is the actual weight", () => {
    const m = measure({}, "Road", null);
    expect(m.volumetricKg).toBeNull();
    expect(m.chargeableBasis).toBe("actual");
    expect(toFixed(m.chargeableKg, 1)).toBe("50.0");
  });

  test("Road with a divisor given uses it", () => {
    expect(measure({}, "Road", "6000").chargeableBasis).toBe("volumetric");
  });
});

describe("sea weight / measure", () => {
  test("light goods are charged on volume (CBM above tonnes)", () => {
    const m = measure({}, "Sea", "1000");
    expect(m.seaBasis!.basis).toBe("measure");
    expect(toFixed(m.seaBasis!.revenueTons, 3)).toBe("0.372");
    // 0.372 CBM × 1,000 kg = 372 kg volumetric, above the 50 kg actual.
    expect(toFixed(m.chargeableKg, 1)).toBe("372.0");
  });

  test("dense goods are charged on weight (tonnes above CBM)", () => {
    const m = measure({ cartonKg: "100" }, "Sea", "1000");
    expect(m.seaBasis!.basis).toBe("weight");
    expect(toFixed(m.seaBasis!.revenueTons, 3)).toBe("0.500");
  });
});

describe("rejected inputs", () => {
  test.each([
    ["quantity", { quantity: "0" }, "quantity"],
    ["fractional quantity", { quantity: "10.5" }, "quantity"],
    ["negative quantity", { quantity: "-5" }, "quantity"],
    ["fractional pcs per carton", { pcsPerCarton: "2.5" }, "pieces per carton"],
    ["zero pcs per carton", { pcsPerCarton: "0" }, "pieces per carton"],
    ["zero length", { lengthCm: "0" }, "length, width and height"],
    ["negative height", { heightCm: "-1" }, "length, width and height"],
    ["blank width", { widthCm: "" }, "length, width and height"],
    ["zero weight", { cartonKg: "0" }, "weight"],
  ])("%s", (_name, input, word) => {
    const result = measureSkuLine({ ...CARTON, ...input }, { mode: "Air", divisor: "6000" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain(word);
  });

  test("a zero or negative divisor", () => {
    for (const divisor of ["0", "-6000", "abc"]) {
      expect(measureSkuLine(CARTON, { mode: "Air", divisor }).ok).toBe(false);
    }
  });
});

describe("shipment totals", () => {
  test("sums the lines", () => {
    const totals = shipmentTotals([measure({}), measure({ quantity: "105" })]);
    expect(totals.cartons).toBe(BigInt(11));
    expect(toFixed(totals.actualKg, 1)).toBe("110.0");
    expect(toFixed(totals.volumetricKg!, 1)).toBe("136.4");
    expect(toFixed(totals.chargeableKg, 1)).toBe("136.4");
  });

  test("no volumetric weight without a divisor", () => {
    expect(shipmentTotals([measure({}, "Road", null)]).volumetricKg).toBeNull();
  });
});

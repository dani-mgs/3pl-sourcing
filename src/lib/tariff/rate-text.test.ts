import { describe, expect, test } from "vitest";
import { parseRateText, type ParsedRate } from "./rate-text";
import { parseDecimal, toFixed } from "./rational";
import fixture from "./__fixtures__/hts-rate-texts-2026-rev20.json";

// Rate texts below are copied from the 2026 HTS, Revision 20 (USITC).

function summary(parsed: ParsedRate) {
  if (parsed.kind !== "rate") return parsed.kind;
  return {
    pct: parsed.adValoremPct ? toFixed(parsed.adValoremPct, 4) : null,
    cents: parsed.specific ? toFixed(parsed.specific.centsPerUnit, 4) : null,
    unit: parsed.specific?.unitLabel ?? null,
  };
}

describe("parseRateText", () => {
  test.each([
    ["6%", { pct: "6.0000", cents: null, unit: null }], // 6402.99.31
    ["1.9¢/kg", { pct: null, cents: "1.9000", unit: "kg" }], // 0805.10.00
    ["0.4¢/kg + 20%", { pct: "20.0000", cents: "0.4000", unit: "kg" }], // 7208.10.15 column 2
    ["0.4¢/kg +20%", { pct: "20.0000", cents: "0.4000", unit: "kg" }], // spacing varies in the HTS
    ["$1.035/kg", { pct: null, cents: "103.5000", unit: "kg" }],
    ["6.3¢/liter", { pct: null, cents: "6.3000", unit: "liters" }], // 2204.21.50
    ["$1.35/pf. liter", { pct: null, cents: "135.0000", unit: "proof liters" }],
    ["2¢ each + 5%", { pct: "5.0000", cents: "2.0000", unit: "units (each)" }],
    ["$1.13/m3", { pct: null, cents: "113.0000", unit: "m³" }],
    ["89.6¢/1000", { pct: null, cents: "89.6000", unit: "thousands" }],
    ["33 1/3%", { pct: "33.3333", cents: null, unit: null }],
  ])("%s", (text, expected) => {
    expect(summary(parseRateText(text))).toEqual(expected);
  });

  test("Free is zero duty", () => {
    expect(parseRateText("Free")).toEqual({ kind: "free" });
  });

  test("33 1/3% is kept as an exact fraction", () => {
    const parsed = parseRateText("33 1/3%");
    expect(parsed.kind === "rate" && parsed.adValoremPct).toEqual({ n: BigInt(100), d: BigInt(3) });
  });

  test.each([
    "5.1¢/kg on drained weight",
    "The rate applicable to each garment in the ensemble if separately entered",
    "$1.53 each + 6% on the case + 5.3% on the strap, band or bracelet",
    "Free, under bond",
    "86.1¢/m2of recording surface",
    "4.4¢/kg on copper content + 0.8¢/kg on lead content + 0.8¢/kg on zinc content",
    "6% + 6%",
    "See additional U.S. note 3",
    "",
  ])("unsupported: %s", (text) => {
    expect(parseRateText(text).kind).toBe("unsupported");
  });

  test("dollar rates convert to cents exactly", () => {
    const parsed = parseRateText("$1.035/kg");
    expect(parsed.kind === "rate" && parsed.specific?.centsPerUnit).toEqual(parseDecimal("103.5"));
  });
});

describe("coverage of the published schedule", () => {
  // Every distinct general and column 2 rate in chapters 1–97 of Revision 20,
  // with the number of lines carrying it.
  const rates = Object.entries(fixture.rates as Record<string, number>);
  const total = rates.reduce((sum, [, n]) => sum + n, 0);
  const supported = rates.filter(([text]) => parseRateText(text).kind !== "unsupported");
  const supportedLines = supported.reduce((sum, [, n]) => sum + n, 0);

  test("at least 97% of rated lines can be calculated", () => {
    expect(total).toBeGreaterThan(20_000);
    expect(supportedLines / total).toBeGreaterThan(0.97);
  });

  test("no published rate makes the parser throw", () => {
    for (const [text] of rates) expect(() => parseRateText(text)).not.toThrow();
  });
});

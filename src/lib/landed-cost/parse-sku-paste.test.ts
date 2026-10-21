import { describe, expect, test } from "vitest";
import { IGNORE_REASONS, parseSkuPaste, splitTsv } from "./parse-sku-paste";

// Excel's clipboard text into rows: headings mapped by name (with aliases,
// the experts' sheet headings included), the fixed order without a header
// row, and every calculated column listed as ignored with why.

const tsv = (rows: string[][], eol = "\r\n") => rows.map((r) => r.join("\t")).join(eol) + eol;
function ok(text: string) {
  const parsed = parseSkuPaste(text);
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed;
}

// The experts' two sheets, heading rows as they name them.
const SHEET_1 = [
  "SKU", "Quantity", "Unit Cost", "Total Unit Cost", "Box Configuration (pcs/carton)", "Number of cartons",
  "Total Weight/Master Carton (kg)", "Volumetric Weight/Master Carton (CBM)", "Ad Valorem", "Section 301", "Reciprocal",
  "Total Tariff Rate", "Tariff Cost", "MPF Rate", "MPF Cost", "HMF Rate", "HMF Cost", "Freight per Unit", "Total Freight",
  "Other Costs", "Total Landed Cost", "Landed Cost",
];
const SHEET_2 = [
  "SKU", "Quantity", "FOB Unit Cost (USD)", "Unit Cost", "Tariff Rate", "Box Configuration (pcs/carton)",
  "Total Weight/Master Carton (kg)", "Total Freight Cost (USD)", "Freight/pc", "Landed Cost",
];

describe("splitTsv: as Excel copies", () => {
  test("CRLF or LF, quoted cells with tabs, newlines and doubled quotes, trailing empty cells dropped", () => {
    expect(splitTsv('A\t"two\tparts"\t"line 1\nline 2"\t"say ""hi"""\t\t\r\nB\tx\n')).toEqual([
      ["A", "two\tparts", "line 1\nline 2", 'say "hi"'],
      ["B", "x"],
    ]);
  });

  test("a quote inside a cell (not at its start) is just a character", () => {
    expect(splitTsv('12" pipe\tx')).toEqual([['12" pipe', "x"]]);
  });
});

describe("the experts' header layouts", () => {
  test("sheet 1: inputs mapped, every other heading ignored with its reason", () => {
    const p = ok(tsv([SHEET_1, ["SKU-001", "100", "$6.00", "$600.00", "20", "5", "5", "0.064", "3.4%", "25%", "10%", "38.4%", "$230.40", "0.3464%", "$2.08", "0.125%", "$0.75", "$8.54", "$854.00", "$0", "$1,734.73", "$17.35"]]));
    expect(p.hasHeader).toBe(true);
    expect(p.columns.map((c) => [c.heading, c.field])).toEqual([
      ["SKU", "skuCode"],
      ["Quantity", "quantity"],
      ["Unit Cost", "fobUnitPriceUsd"],
      ["Box Configuration (pcs/carton)", "pcsPerCarton"],
      ["Total Weight/Master Carton (kg)", "cartonGrossKg"],
    ]);
    const why = Object.fromEntries(p.ignored.map((c) => [c.heading, c.reason]));
    expect(why).toEqual({
      "Total Unit Cost": IGNORE_REASONS.calculated,
      "Number of cartons": IGNORE_REASONS.calculated,
      "Volumetric Weight/Master Carton (CBM)": IGNORE_REASONS.cbm,
      "Ad Valorem": IGNORE_REASONS.rates,
      "Section 301": IGNORE_REASONS.rates,
      Reciprocal: IGNORE_REASONS.rates,
      "Total Tariff Rate": IGNORE_REASONS.rates,
      "Tariff Cost": IGNORE_REASONS.rates,
      "MPF Rate": IGNORE_REASONS.rates,
      "MPF Cost": IGNORE_REASONS.rates,
      "HMF Rate": IGNORE_REASONS.rates,
      "HMF Cost": IGNORE_REASONS.rates,
      "Freight per Unit": IGNORE_REASONS.freight,
      "Total Freight": IGNORE_REASONS.freight,
      "Other Costs": IGNORE_REASONS.otherCosts,
      "Total Landed Cost": IGNORE_REASONS.rates,
      "Landed Cost": IGNORE_REASONS.rates,
    });
    expect(p.rows).toEqual([
      { rowNumber: 2, values: { skuCode: "SKU-001", quantity: "100", fobUnitPriceUsd: "$6.00", pcsPerCarton: "20", cartonGrossKg: "5" } },
    ]);
  });

  test('sheet 2: "FOB Unit Cost (USD)" wins over "Unit Cost", which is listed as ignored', () => {
    const p = ok(tsv([SHEET_2, ["SKU-001", "100", "6.00", "6.10", "38.4%", "20", "5", "$1,053.00", "$10.53", "$19.69"]]));
    expect(p.columns.map((c) => c.field)).toEqual(["skuCode", "quantity", "fobUnitPriceUsd", "pcsPerCarton", "cartonGrossKg"]);
    expect(p.rows[0].values.fobUnitPriceUsd).toBe("6.00");
    expect(p.ignored).toEqual([
      { heading: "Unit Cost", reason: "Another column (FOB Unit Cost (USD)) already gives FOB per unit (USD)." },
      { heading: "Tariff Rate", reason: IGNORE_REASONS.rates },
      { heading: "Total Freight Cost (USD)", reason: IGNORE_REASONS.freight },
      { heading: "Freight/pc", reason: IGNORE_REASONS.freight },
      { heading: "Landed Cost", reason: IGNORE_REASONS.rates },
    ]);
  });

  test("after the exact names: tariff, duty, rate, MPF, HMF, landed or freight words are 'calculated or entered elsewhere'; others not recognised", () => {
    const p = ok(tsv([["sku", "Duty Amount", "Ocean freight quote", "Exchange rate", "Colour", "Pallet CBM"], ["A"]]));
    expect(p.ignored).toEqual([
      { heading: "Duty Amount", reason: IGNORE_REASONS.elsewhere },
      { heading: "Ocean freight quote", reason: IGNORE_REASONS.elsewhere },
      { heading: "Exchange rate", reason: IGNORE_REASONS.elsewhere },
      { heading: "Colour", reason: IGNORE_REASONS.unknown },
      { heading: "Pallet CBM", reason: IGNORE_REASONS.cbm },
    ]);
  });

  test("our own names, any case and spacing; units never guessed", () => {
    const p = ok(tsv([["  sku code ", "DESCRIPTION", "HTS code", "Qty", "FOB per unit", "Pcs per carton", "L (cm)", "W (cm)", "H (cm)", "Carton kg", "Length", "Weight"], ["A"]]));
    expect(p.columns.map((c) => c.field)).toEqual([
      "skuCode", "description", "htsCode", "quantity", "fobUnitPriceUsd", "pcsPerCarton", "cartonLengthCm", "cartonWidthCm", "cartonHeightCm", "cartonGrossKg",
    ]);
    expect(p.ignored).toEqual([
      { heading: "Length", reason: 'Unit not stated. Name it "L (cm)".' },
      { heading: "Weight", reason: 'Unit not stated. Name it "Carton kg".' },
    ]);
  });
});

describe("no header row: the fixed order", () => {
  test("SKU, Description, HTS, Quantity, FOB, Pcs, L, W, H, Carton kg; extra columns listed", () => {
    const p = ok(tsv([["SKU-001", "Ceramic mug", "6912.00.48.00", "100", "6.00", "20", "40", "30", "20", "5", "extra"]], "\n"));
    expect(p.hasHeader).toBe(false);
    expect(p.rows[0]).toEqual({
      rowNumber: 1,
      values: {
        skuCode: "SKU-001", description: "Ceramic mug", htsCode: "6912.00.48.00", quantity: "100", fobUnitPriceUsd: "6.00",
        pcsPerCarton: "20", cartonLengthCm: "40", cartonWidthCm: "30", cartonHeightCm: "20", cartonGrossKg: "5",
      },
    });
    expect(p.ignored).toEqual([{ heading: "Column 11", reason: "Beyond the fixed order." }]);
  });

  test("blank rows are skipped but row numbers stay those of the paste; a one-letter size isn't a heading", () => {
    const p = ok("A\tL\r\n\t\t\r\nB\r\n");
    expect(p.hasHeader).toBe(false);
    expect(p.rows.map((r) => r.rowNumber)).toEqual([1, 3]);
  });
});

describe("refused pastes", () => {
  test("nothing, only headings, no SKU column", () => {
    expect(parseSkuPaste("\r\n\t\n")).toEqual({ ok: false, error: "Nothing to import. Copy the rows in Excel, then paste them here." });
    expect(parseSkuPaste("SKU\tQuantity\r\n")).toEqual({ ok: false, error: "Only a header row was pasted. Copy the rows below it too." });
    expect(parseSkuPaste("Quantity\tUnit Cost\r\n10\t2\r\n")).toMatchObject({ ok: false, error: expect.stringMatching(/^No SKU column found/) });
  });

  test("more than 100 rows", () => {
    const rows = Array.from({ length: 101 }, (_, i) => [`SKU-${i}`]);
    expect(parseSkuPaste(tsv(rows))).toEqual({ ok: false, error: "A workspace can have at most 100 SKUs; this paste has 101 rows." });
    expect(ok(tsv(rows.slice(0, 100))).rows).toHaveLength(100);
  });

  test("too long", () => {
    expect(parseSkuPaste("x".repeat(500_001))).toMatchObject({ ok: false, error: expect.stringMatching(/too long/) });
  });
});

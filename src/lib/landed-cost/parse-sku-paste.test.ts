import { describe, expect, test } from "vitest";
import { IGNORE_REASONS, SUB_HEADING_NOTE, normalizeHeading, parseSkuPaste, splitTsv } from "./parse-sku-paste";

// Excel's clipboard text into rows: headings mapped by name (with aliases,
// the experts' sheet headings included), the fixed order without a header
// row, and every calculated column listed as ignored with why.

const tsv = (rows: string[][], eol = "\r\n") => rows.map((r) => r.join("\t")).join(eol) + eol;
function ok(text: string) {
  const parsed = parseSkuPaste(text);
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed;
}

// The experts' real workbook, as Excel copies it: blank cells under the
// merged "Tariff Rate (%)" heading, a second heading row for its sub-columns,
// and line breaks inside the quoted CBM heading.
const SHEET_1 = [
  ["SKU", "Quantity", "Unit Cost (USD)", "Total Unit Cost (USD)", "Freight Cost per Unit (USD)", "Total Freight Cost (USD)", "Tariff Rate (%)", "", "",
    "Total Tariff Rate", "Tariff Cost (USD)", "MPF Rate (%)", "MPF Cost (USD)", "HMF Rate (%)", "HMF Cost (USD)", "Other Costs (USD)", "Total Landed Cost (USD)"],
  ["", "", "", "", "", "", "Ad Valorem", "Section 301", "Reciprocal"],
  ["SKU-001", "100", "6", "600", "1", "100", "0.075", "0.25", "1.25", "1.575", "945", "0.003464", "2.4248", "0.00125", "0.875", "0", "16.482998"],
];
const SHEET_2 = [
  ["SKU", "Quantity", "FOB Unit Cost (USD)", "Box Configuration (pcs/carton)", "Number of cartons", "Total Unit Cost (USD)",
    '"Volumetric\nWeight/ Master Carton\n(CBM)"', "Total Weight / Master Carton (kg)", "Total Freight Cost (USD)", "Freight/ pc", "Tariff Rate (%)", "", "",
    "Total Tariff Rate", "Tariff Cost (USD)", "MPF Rate (%)", "MPF Cost (USD)", "HMF Rate (%)", "HMF Cost (USD)", "Other Costs (USD)", "Total Landed Cost (USD)"],
  ["", "", "", "", "", "", "", "", "", "", "Ad Valorem", "Section 301", "Reciprocal"],
  ["SKU-001 - VIETNAM", "100", "8", "20", "5", "800", "6", "10", "1053", "10.53", "0.1", "0", "0", "0.1", "80", "0.003464", "6.418792", "0.00125", "2.31625", "0", "19.41735042"],
  ["SKU-001- CHINA", "100", "6", "20", "5", "600", "6", "10", "854", "8.54", "0.034", "0.25", "1.25", "1.534", "920.4", "0.003464", "5.036656", "0.00125", "1.8175", "0", "23.81254156"],
];
const RATES = IGNORE_REASONS.rates;
const TARIFF_AND_FEES = [
  { heading: "Tariff Rate (%)", reason: RATES },
  { heading: "Total Tariff Rate", reason: RATES },
  { heading: "Tariff Cost (USD)", reason: RATES },
  { heading: "MPF Rate (%)", reason: RATES },
  { heading: "MPF Cost (USD)", reason: RATES },
  { heading: "HMF Rate (%)", reason: RATES },
  { heading: "HMF Cost (USD)", reason: RATES },
  { heading: "Other Costs (USD)", reason: IGNORE_REASONS.otherCosts },
  { heading: "Total Landed Cost (USD)", reason: RATES },
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

describe("the experts' real sheets", () => {
  test("sheet 1: SKU, quantity and FOB (from Unit Cost (USD)) only; the sub-heading row skipped; every other column listed with its reason", () => {
    const p = ok(tsv(SHEET_1));
    expect(p.columns.map((c) => [c.heading, c.field])).toEqual([
      ["SKU", "skuCode"],
      ["Quantity", "quantity"],
      ["Unit Cost (USD)", "fobUnitPriceUsd"],
    ]);
    expect(p.notes).toEqual([SUB_HEADING_NOTE]);
    expect(p.ignored).toEqual([
      { heading: "Total Unit Cost (USD)", reason: IGNORE_REASONS.calculated },
      { heading: "Freight Cost per Unit (USD)", reason: IGNORE_REASONS.freight },
      { heading: "Total Freight Cost (USD)", reason: IGNORE_REASONS.freight },
      ...TARIFF_AND_FEES,
    ]);
    // No tariff, fee, freight or landed-cost value, including the ones under the blank headings.
    expect(p.rows).toEqual([{ rowNumber: 3, values: { skuCode: "SKU-001", quantity: "100", fobUnitPriceUsd: "6" } }]);
  });

  test("sheet 2: SKU, quantity, FOB, pcs/carton and carton kg (\"Total Weight / Master Carton (kg)\"); the CBM heading with line breaks gets the CBM note", () => {
    const p = ok(tsv(SHEET_2));
    expect(p.columns.map((c) => [c.heading, c.field])).toEqual([
      ["SKU", "skuCode"],
      ["Quantity", "quantity"],
      ["FOB Unit Cost (USD)", "fobUnitPriceUsd"],
      ["Box Configuration (pcs/carton)", "pcsPerCarton"],
      ["Total Weight / Master Carton (kg)", "cartonGrossKg"],
    ]);
    expect(p.notes).toEqual([SUB_HEADING_NOTE]);
    expect(p.ignored).toEqual([
      { heading: "Number of cartons", reason: IGNORE_REASONS.calculated },
      { heading: "Total Unit Cost (USD)", reason: IGNORE_REASONS.calculated },
      { heading: "Volumetric Weight/ Master Carton (CBM)", reason: IGNORE_REASONS.cbm },
      { heading: "Total Freight Cost (USD)", reason: IGNORE_REASONS.freight },
      { heading: "Freight/ pc", reason: IGNORE_REASONS.freight },
      ...TARIFF_AND_FEES,
    ]);
    expect(p.rows).toEqual([
      { rowNumber: 3, values: { skuCode: "SKU-001 - VIETNAM", quantity: "100", fobUnitPriceUsd: "8", pcsPerCarton: "20", cartonGrossKg: "10" } },
      { rowNumber: 4, values: { skuCode: "SKU-001- CHINA", quantity: "100", fobUnitPriceUsd: "6", pcsPerCarton: "20", cartonGrossKg: "10" } },
    ]);
  });

  test("headings: case, newlines and spaces around / don't matter; (USD) is optional on every alias", () => {
    expect(normalizeHeading("  Total Weight /\n Master   Carton (kg) ")).toBe("total weight/master carton (kg)");
    const p = ok(tsv([["SKU (USD)", "Qty (usd)", "FOB price (USD)", "Pcs per carton"], ["A"]]));
    expect(p.columns.map((c) => c.field)).toEqual(["skuCode", "quantity", "fobUnitPriceUsd", "pcsPerCarton"]);
  });

  test("a second row that isn't only sub-headings, or has a SKU, is data", () => {
    expect(ok(tsv([["SKU", "Tariff Rate (%)"], ["", "Ad Valorem"], ["A", "1"]])).notes).toEqual([SUB_HEADING_NOTE]);
    const withSku = ok(tsv([["SKU", "Tariff Rate (%)"], ["Ad Valorem", "Section 301"]]));
    expect([withSku.notes, withSku.rows.map((r) => r.values.skuCode)]).toEqual([[], ["Ad Valorem"]]);
    const other = ok(tsv([["SKU", "Quantity", "Tariff Rate (%)"], ["", "10", "Ad Valorem"]]));
    expect([other.notes, other.rows]).toEqual([[], [{ rowNumber: 2, values: { skuCode: "", quantity: "10" } }]]);
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

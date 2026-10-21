import { describe, expect, test } from "vitest";
import { L1, S1, S2, scenario, skuLine, vietnamScenario, workspace } from "./__fixtures__/workspace-builders";
import { toEditorDraft, toSaveInput, type EditorDraft } from "./editor-draft";
import { parseDraft } from "./parse-draft";
import { parseSkuPaste } from "./parse-sku-paste";
import { applySkuPaste, countryInCode, pasteNotice, previewSkuPaste } from "./sku-paste";

// Pasted rows against the draft: update by SKU code, add new ones, errors in
// saving's words, warnings that never change anything, the 100-SKU limit,
// and applying only to the chosen origin's prices and packing.

const HEAD = "SKU\tDescription\tHTS code\tQuantity\tFOB Unit Cost (USD)\tPcs per carton\tL (cm)\tW (cm)\tH (cm)\tCarton kg";
const two = () => toEditorDraft(workspace({ scenarios: [scenario(), vietnamScenario()] }))!;
function preview(draft: EditorDraft, text: string, originRef = S1) {
  const parsed = parseSkuPaste(text);
  if (!parsed.ok) throw new Error(parsed.error);
  return previewSkuPaste(draft, originRef, parsed);
}
let n = 0;
const ref = () => `new-${++n}`;

describe("update or add, by SKU code", () => {
  test("an existing code updates; a new one adds; blanks leave values as they are", () => {
    const p = preview(two(), `${HEAD}\nSKU-001\t\t\t250\t$7.25\nSKU-002\tLamp\t9405.11.40.10\t1,000\t$1,053.00\t10\t50\t40\t30\t8.5\n`);
    expect(p.rows.map((r) => [r.rowNumber, r.action, r.errors, r.stillNeeded])).toEqual([
      [2, "update", [], []],
      [3, "add", [], []],
    ]);
    expect(p.rows[1].values).toMatchObject({ quantity: "1000", fobUnitPriceUsd: "1053.00", htsCode: "9405.11.40.10" });
    expect([p.updates, p.adds, p.errorRows, p.limitError]).toEqual([1, 1, 0, null]);
  });

  test("a new SKU with no HTS or quantity is applied, with what saving will still ask for", () => {
    const p = preview(two(), "SKU\tUnit Cost\nSKU-009\t4.00\n");
    expect(p.rows[0]).toMatchObject({ action: "add", errors: [], stillNeeded: ["HTS code", "Quantity"] });
  });
});

describe("per-row errors, in saving's words", () => {
  test("bad values, a missing code, a code twice; nothing silently dropped", () => {
    const p = preview(
      two(),
      `${HEAD}\nSKU-002\t\t12345\t1.5\t0\nSKU-003\t\t\t10\t\t\t-4\n\tNo code\nDUP\nDUP\n`,
    );
    expect(p.rows.map((r) => [r.rowNumber, r.action, r.errors])).toEqual([
      [
        2,
        "error",
        [
          "Enter an 8- or 10-digit HTS code (10 digits recommended), e.g. 7208.10.15.00.",
          "Enter the quantity as a whole number from 1 to 999,999,999,999.",
          "Enter a FOB price above $0.00.",
        ],
      ],
      [3, "error", ["Enter the carton length in cm, above zero with up to 2 decimals."]],
      [4, "error", ["Enter a SKU code of 1 to 60 characters."]],
      [5, "error", ['The SKU code "DUP" appears more than once in this paste.']],
      [6, "error", ['The SKU code "DUP" appears more than once in this paste.']],
    ]);
    expect(p.errorRows).toBe(5);
  });

  test("a value already in the draft isn't the paste's error", () => {
    const d = two();
    const broken = { ...d, skus: [{ ...d.skus[0], quantity: "oops" }] };
    expect(preview(broken, "SKU\tUnit Cost\nSKU-001\t6.50\n").rows[0]).toMatchObject({ action: "update", errors: [] });
  });
});

describe("warnings: shown, never acted on", () => {
  test("a country at the end of a SKU code, after a separator", () => {
    const p = preview(two(), "SKU\nSKU-001 - VIETNAM\nSKU-002- CHINA\nSKU-003-CN\nCHINATOWN-1\nVIETNAMESE\n");
    expect(p.rows.map((r) => r.warnings)).toEqual([
      ["This SKU code seems to include a country (VIETNAM). Consider removing it so the same SKU matches across origins."],
      ["This SKU code seems to include a country (CHINA). Consider removing it so the same SKU matches across origins."],
      ["This SKU code seems to include a country (CN). Consider removing it so the same SKU matches across origins."],
      [],
      [],
    ]);
    expect(p.rows[0]).toMatchObject({ action: "add", skuCode: "SKU-001 - VIETNAM" });
    expect(countryInCode("VIETNAM")).toBeNull();
  });

  test("the experts' sheet 2 as pasted: both rows warned about the country; FOB, packing and quantity only", () => {
    const head = [
      "SKU", "Quantity", "FOB Unit Cost (USD)", "Box Configuration (pcs/carton)", "Number of cartons", "Total Unit Cost (USD)",
      '"Volumetric\nWeight/ Master Carton\n(CBM)"', "Total Weight / Master Carton (kg)", "Total Freight Cost (USD)", "Freight/ pc", "Tariff Rate (%)", "", "",
      "Total Tariff Rate", "Tariff Cost (USD)", "MPF Rate (%)", "MPF Cost (USD)", "HMF Rate (%)", "HMF Cost (USD)", "Other Costs (USD)", "Total Landed Cost (USD)",
    ];
    const sub = ["", "", "", "", "", "", "", "", "", "", "Ad Valorem", "Section 301", "Reciprocal"];
    const vn = ["SKU-001 - VIETNAM", "100", "8", "20", "5", "800", "6", "10", "1053", "10.53", "0.1", "0", "0", "0.1", "80", "0.003464", "6.418792", "0.00125", "2.31625", "0", "19.41735042"];
    const cn = ["SKU-001- CHINA", "100", "6", "20", "5", "600", "6", "10", "854", "8.54", "0.034", "0.25", "1.25", "1.534", "920.4", "0.003464", "5.036656", "0.00125", "1.8175", "0", "23.81254156"];
    const p = preview(two(), [head, sub, vn, cn].map((r) => r.join("\t")).join("\r\n") + "\r\n");
    expect(p.notes).toEqual(["Skipped a second heading row (tariff sub-columns)."]);
    expect(p.rows.map((r) => [r.skuCode, r.action, r.warnings])).toEqual([
      ["SKU-001 - VIETNAM", "add", ["This SKU code seems to include a country (VIETNAM). Consider removing it so the same SKU matches across origins."]],
      ["SKU-001- CHINA", "add", ["This SKU code seems to include a country (CHINA). Consider removing it so the same SKU matches across origins."]],
    ]);
    const { draft } = applySkuPaste(two(), p, ref);
    const added = draft.skus.slice(1).map((s) => draft.scenarios[0].items[s.ref]);
    expect(added).toEqual([
      { fobUnitPriceUsd: "8", pcsPerCarton: "20", cartonLengthCm: "", cartonWidthCm: "", cartonHeightCm: "", cartonGrossKg: "10" },
      { fobUnitPriceUsd: "6", pcsPerCarton: "20", cartonLengthCm: "", cartonWidthCm: "", cartonHeightCm: "", cartonGrossKg: "10" },
    ]);
    expect(draft.skus.slice(1).map((s) => [s.quantity, s.htsCode, s.description])).toEqual([["100", "", ""], ["100", "", ""]]);
  });

  test("a new code that differs only by case is added as new, with a warning", () => {
    const p = preview(two(), "SKU\tQuantity\nsku-001\t5\n");
    expect(p.rows[0]).toMatchObject({ action: "add", warnings: ["Differs only by case from SKU-001; it will be added as a new SKU."] });
  });
});

describe("the 100-SKU limit counts the SKUs already there", () => {
  test("too many new SKUs: nothing can be applied, and it says how many to remove", () => {
    const lines = Array.from({ length: 98 }, (_, i) => skuLine({ id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`, skuCode: `OLD-${i}` }));
    const d = toEditorDraft(workspace({ skuLines: lines, scenarios: [scenario({ items: [] })] }))!;
    const p = preview(d, "SKU\nOLD-1\nNEW-1\nNEW-2\nNEW-3\n");
    expect(p.limitError).toBe("This would make 101 SKUs; a workspace can have at most 100. Remove 1 new row or delete SKUs first.");
    expect(applySkuPaste(d, p, ref).draft).toBe(d);
    expect(preview(d, "SKU\nOLD-1\nNEW-1\nNEW-2\n").limitError).toBeNull();
  });
});

describe("applySkuPaste", () => {
  test("shared fields on every origin; FOB and packing on the chosen origin only; new SKUs empty elsewhere", () => {
    const d = two();
    const p = preview(d, `${HEAD}\nSKU-001\tMug\t\t\t7.25\t24\nSKU-002\tLamp\t9405114010\t10\t3.00\t5\t50\t40\t30\t8.5\n`, S2);
    expect(p.originLabel).toBe("Vietnam");
    const { draft, updated, added } = applySkuPaste(d, p, ref);
    expect([updated, added]).toEqual([1, 1]);
    const newRef = draft.skus[1].ref;
    expect(draft.skus.map((s) => [s.skuCode, s.description, s.htsCode, s.quantity])).toEqual([
      ["SKU-001", "Mug", d.skus[0].htsCode, "100"],
      ["SKU-002", "Lamp", "9405.11.40.10", "10"],
    ]);
    const [china, vietnam] = draft.scenarios;
    expect(china.items[L1]).toEqual(d.scenarios[0].items[L1]);
    expect(china.items[newRef].fobUnitPriceUsd).toBe("");
    expect(vietnam.items[L1]).toMatchObject({ fobUnitPriceUsd: "7.25", pcsPerCarton: "24", cartonGrossKg: d.scenarios[1].items[L1].cartonGrossKg });
    expect(vietnam.items[newRef]).toEqual({ fobUnitPriceUsd: "3.00", pcsPerCarton: "5", cartonLengthCm: "50", cartonWidthCm: "40", cartonHeightCm: "30", cartonGrossKg: "8.5" });

    // What the save receives is accepted.
    const parsed = parseDraft(toSaveInput(draft, "w1", "2026-10-21T02:02:38.123456+00:00").draft);
    expect(parsed.ok).toBe(true);
    expect(pasteNotice(p.originLabel, updated, added)).toBe("Pasted 2 rows into Vietnam (1 updated, 1 added). Save draft to keep them.");
  });

  test('"Apply valid rows" skips exactly the rows with errors; nothing is deleted', () => {
    const d = two();
    const p = preview(d, "SKU\tQuantity\nSKU-002\t5\nSKU-003\tmany\n");
    const { draft, added } = applySkuPaste(d, p, ref);
    expect(added).toBe(1);
    expect(draft.skus.map((s) => s.skuCode)).toEqual(["SKU-001", "SKU-002"]);
  });
});

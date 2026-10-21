import { describe, expect, test } from "vitest";
import { L1, L2, S1, S2, item, scenario, skuLine, vietnamScenario, workspace } from "./__fixtures__/workspace-builders";
import { toEditorDraft, type EditorDraft } from "./editor-draft";
import {
  MAX_ORIGINS,
  addBlankOrigin,
  canAddOrigin,
  defaultLabel,
  duplicateOrigin,
  labelError,
  removeOrigin,
  setBaseline,
} from "./origin-draft";

// Managing origins in the local draft.

const china = () =>
  toEditorDraft(
    workspace({
      skuLines: [skuLine(), skuLine({ id: L2, skuCode: "SKU-002" })],
      scenarios: [
        scenario({
          shipmentMode: "Air",
          entryType: "formal",
          freightBasis: "value",
          volumetricDivisor: "5000",
          incoterm: "FCA",
          supplierName: "Ningbo Ceramics",
          items: [item(), item({ skuLineId: L2, fobUnitPriceUsd: "3.50", pcsPerCarton: "40" })],
          otherCosts: [{ id: "c-old", label: "Brokerage", amountUsd: "95.00" }],
        }),
      ],
    }),
  )!;
const two = () => toEditorDraft(workspace({ scenarios: [scenario(), vietnamScenario()] }))!;
let n = 0;
const ref = () => `ref-${++n}`;

describe("defaultLabel: the country, never a duplicate", () => {
  test("the country name when free", () => {
    expect(defaultLabel("Vietnam", "", ["China"])).toBe("Vietnam");
  });

  test('taken: "<Country> (<supplier>)", then "<Country> 2", "<Country> 3"', () => {
    expect(defaultLabel("China", "Shenzhen Works", ["China"])).toBe("China (Shenzhen Works)");
    expect(defaultLabel("China", "", ["China"])).toBe("China 2");
    expect(defaultLabel("China", "Shenzhen Works", ["China", "China (Shenzhen Works)", "China 2"])).toBe("China 3");
  });

  test("never over 60 characters", () => {
    const long = "Saint Helena, Ascension and Tristan da Cunha";
    expect(defaultLabel(long, "A very long supplier name that goes on and on", [long]).length).toBeLessThanOrEqual(60);
    const name = "x".repeat(60);
    const second = defaultLabel(name, "", [name]);
    expect(second).toHaveLength(60);
    expect(second.endsWith(" 2")).toBe(true);
  });
});

describe("duplicateOrigin", () => {
  const vietnam = { ref: "new-vn", countryCode: "VN", countryName: "Vietnam" };

  test("copies mode, incoterm, entry type, freight split, divisor, packing and other costs", () => {
    const d = duplicateOrigin(china(), S1, vietnam, ref);
    const copy = d.scenarios[1];
    expect(copy).toMatchObject({
      ref: "new-vn", id: null, label: "Vietnam", originCountry: "VN",
      shipmentMode: "Air", incoterm: "FCA", entryType: "formal", freightBasis: "value", volumetricDivisor: "5000",
    });
    expect(copy.items[L2]).toMatchObject({ pcsPerCarton: "40", cartonLengthCm: "40", cartonGrossKg: "5" });
    expect(copy.otherCosts).toEqual([{ ref: expect.stringMatching(/^ref-/), id: null, label: "Brokerage", amountUsd: "95.00" }]);
    expect(copy.otherCosts[0].ref).not.toBe("c-old");
  });

  test("never the FOB prices, the freight total or the supplier: those start empty", () => {
    const copy = duplicateOrigin(china(), S1, vietnam, ref).scenarios[1];
    expect(copy.items[L1].fobUnitPriceUsd).toBe("");
    expect(copy.items[L2].fobUnitPriceUsd).toBe("");
    expect(copy.freightTotalUsd).toBe("");
    expect(copy.supplierName).toBe("");
  });

  test("the label follows the chosen country, never a duplicate; the source is unchanged", () => {
    const source = china();
    const d = duplicateOrigin(source, S1, { ref: "new-cn", countryCode: "CN", countryName: "China" }, ref);
    expect(d.scenarios[1].label).toBe("China 2");
    expect(d.scenarios[0]).toEqual(source.scenarios[0]);
  });
});

describe("addBlankOrigin", () => {
  test("Sea, FOB, automatic entry, everything else empty, in the chosen country", () => {
    const blank = addBlankOrigin(china(), { ref: "new-mx", countryCode: "MX", countryName: "Mexico" }).scenarios[1];
    expect(blank).toMatchObject({
      ref: "new-mx", id: null, label: "Mexico", originCountry: "MX", supplierName: "",
      shipmentMode: "Sea", incoterm: "FOB", entryType: "auto", freightBasis: "chargeable_weight", freightTotalUsd: "", volumetricDivisor: "",
      otherCosts: [],
    });
    expect(Object.values(blank.items).every((i) => Object.values(i).every((v) => v === ""))).toBe(true);
    expect(Object.keys(blank.items)).toEqual([L1, L2]);
  });
});

describe("at most 5 origins", () => {
  test("adding stops at 5", () => {
    let d: EditorDraft = china();
    for (let i = 0; i < 6; i++) d = addBlankOrigin(d, { ref: `o${i}`, countryCode: "MX", countryName: "Mexico" });
    expect(d.scenarios).toHaveLength(MAX_ORIGINS);
    expect(canAddOrigin(d)).toBe(false);
    expect(new Set(d.scenarios.map((s) => s.label)).size).toBe(MAX_ORIGINS);
    expect(duplicateOrigin(d, S1, { ref: "x", countryCode: "VN", countryName: "Vietnam" }, ref).scenarios).toHaveLength(MAX_ORIGINS);
  });
});

describe("removeOrigin and setBaseline", () => {
  test("never the last origin", () => {
    const d = china();
    expect(removeOrigin(d, S1)).toEqual({ draft: d, newBaseline: null });
  });

  test("removing another origin keeps the baseline", () => {
    const { draft, newBaseline } = removeOrigin(two(), S2);
    expect(draft.scenarios.map((s) => s.ref)).toEqual([S1]);
    expect(draft.baselineRef).toBe(S1);
    expect(newBaseline).toBeNull();
  });

  test("removing the baseline makes the first remaining origin the baseline, and says which", () => {
    const { draft, newBaseline } = removeOrigin(two(), S1);
    expect(draft.baselineRef).toBe(S2);
    expect(newBaseline).toBe(S2);
  });

  test("set as baseline", () => {
    expect(setBaseline(two(), S2).baselineRef).toBe(S2);
    expect(setBaseline(two(), "nope").baselineRef).toBe(S1);
  });
});

describe("labelError", () => {
  test("unique, 1-60 characters, trimmed as the database does", () => {
    const d = two();
    const rename = (label: string) => ({ ...d, scenarios: d.scenarios.map((s) => (s.ref === S2 ? { ...s, label } : s)) });
    expect(labelError(d, S2)).toBeNull();
    expect(labelError(rename(" China "), S2)).toBe('Another origin is already labelled "China".');
    expect(labelError(rename("  "), S2)).toBe("Enter a label of 1 to 60 characters.");
    expect(labelError(rename("x".repeat(61)), S2)).toBe("Enter a label of 1 to 60 characters.");
  });
});

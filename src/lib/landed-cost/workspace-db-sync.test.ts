import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { SHIPMENT_MODES } from "@/lib/tariff/calculate";
import { ORIGIN_COUNTRY_CODES } from "@/lib/tariff/countries";
import { UNIT_TOKENS } from "@/lib/tariff/rate-text";
import { createPayload, parseCreateWorkspace, parseDraft, savePayload } from "./parse-draft";
import { FREIGHT_BASES, SUPPORTED_INCOTERMS } from "./scenario-totals";

// The workspace tables' value lists must be exactly the ones the app accepts,
// so the database never stores an input the calculation would refuse (or
// refuses one it accepts). Reads the migration as shipped.

const MIGRATION = readFileSync(
  path.join(process.cwd(), "supabase/migrations/20261021013030_landed_cost_workspaces.sql"),
  "utf8",
);

// The quoted values of `<column> in (...)` in the constraint for that column.
function listFor(column: string): string[] {
  const match = new RegExp(`check \\(${column} in \\(([^)]*)\\)\\)`).exec(MIGRATION);
  if (!match) throw new Error(`no list for ${column}`);
  return [...match[1].matchAll(/'((?:[^']|'')*)'/g)].map((m) => m[1].replace(/''/g, "'"));
}

describe("workspace tables match the app's lists", () => {
  test("origin countries", () => {
    expect(listFor("origin_country")).toEqual([...ORIGIN_COUNTRY_CODES]);
  });

  test("duty quantity units", () => {
    // Sorted: Object.keys lists integer-like keys ("1000") first.
    expect(listFor("duty_quantity_unit").sort()).toEqual([...UNIT_TOKENS].sort());
  });

  test("incoterms, shipment modes, freight bases, entry types", () => {
    expect(listFor("incoterm")).toEqual([...SUPPORTED_INCOTERMS]);
    expect(listFor("shipment_mode").sort()).toEqual([...SHIPMENT_MODES].sort());
    expect(listFor("freight_basis")).toEqual([...FREIGHT_BASES]);
    expect(listFor("entry_type")).toEqual(["auto", "formal"]);
  });

  test("landed_cost_text_ok trims exactly what JavaScript's trim() does", () => {
    const literal = /btrim\(p_text, E'([^']*)'\)/.exec(MIGRATION);
    if (!literal) throw new Error("no btrim set");
    const sqlSet = new Set(
      literal[1]
        .replace(/\\u([0-9a-f]{4})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
        .replace(/\\t/g, "\t")
        .replace(/\\n/g, "\n")
        .replace(/\\f/g, "\f")
        .replace(/\\r/g, "\r"),
    );
    const jsSet = new Set<string>();
    for (let code = 0; code <= 0xffff; code++) {
      const ch = String.fromCharCode(code);
      if (ch.trim() === "") jsSet.add(ch);
    }
    expect([...sqlSet].sort()).toEqual([...jsSet].sort());
  });
});

// The draft functions refuse any key they don't list, so their lists must be
// exactly the keys the payload builders send.
describe("draft functions take exactly the payload's keys", () => {
  const FUNCTIONS = readFileSync(
    path.join(process.cwd(), "supabase/migrations/20261021020238_landed_cost_draft_functions.sql"),
    "utf8",
  );
  const [createPart, savePart] = FUNCTIONS.split("create function public.save_landed_cost_draft");
  const keys = (sql: string, name: string): string[] => {
    const match = new RegExp(`${name} constant text\\[\\] := array\\[([^\\]]*)\\]`).exec(sql);
    if (!match) throw new Error(`no list ${name}`);
    return [...match[1].matchAll(/'([^']*)'/g)].map((m) => m[1]).sort();
  };
  const sorted = (o: object) => Object.keys(o).sort();

  const id = "00000000-0000-4000-8000-000000000001";
  const scenario = {
    label: "China", originCountry: "CN", supplierName: null, incoterm: "FOB", shipmentMode: "Sea", entryType: "auto",
    freightTotalUsd: null, freightBasis: "value", volumetricDivisor: null,
  };
  const draft = parseDraft({
    name: "W", entryDate: "2026-11-01", baselineRef: id,
    skuLines: [{ ref: id, id, skuCode: "A", htsCode: "6402993110", quantity: "1" }],
    scenarios: [{ ref: id, id, ...scenario, items: [{ skuRef: id, fobUnitPriceUsd: "1" }], otherCosts: [{ id, label: "x", amountUsd: "1" }] }],
  });
  if (!draft.ok) throw new Error(draft.error);
  const save = savePayload(draft.data);

  test("save_landed_cost_draft", () => {
    expect(keys(savePart, "v_top")).toEqual(sorted(save));
    expect(keys(savePart, "v_line_keys")).toEqual(sorted(save.sku_lines[0]));
    expect(keys(savePart, "v_scenario_keys")).toEqual(sorted(save.scenarios[0]));
    expect(keys(savePart, "v_item_keys")).toEqual(sorted(save.scenarios[0].items[0]));
    expect(keys(savePart, "v_cost_keys")).toEqual(sorted(save.scenarios[0].other_costs[0]));
  });

  test("create_landed_cost_workspace", () => {
    const created = parseCreateWorkspace({ name: "W", entryDate: "2026-11-01", scenario }, "2026-10-21");
    if (!created.ok) throw new Error(created.error);
    const payload = createPayload(created.data);
    expect(keys(createPart, "v_top")).toEqual(sorted(payload));
    expect(keys(createPart, "v_scenario_keys")).toEqual(sorted(payload.scenario));
  });
});

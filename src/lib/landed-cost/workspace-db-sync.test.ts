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
// The latest definition of each: create_landed_cost_workspace from 2c-1;
// save_landed_cost_draft and save_landed_cost_snapshot as replaced for
// manual rates (20261021135010).
const readMigration = (name: string) => readFileSync(path.join(process.cwd(), "supabase/migrations", name), "utf8");
const OVERRIDES = readMigration("20261021135010_landed_cost_rate_overrides.sql");
const keys = (sql: string, name: string): string[] => {
  const match = new RegExp(`${name}(?: constant)? text\\[\\] := array\\[([^\\]]*)\\]`).exec(sql);
  if (!match) throw new Error(`no list ${name}`);
  return [...match[1].matchAll(/'([^']*)'/g)].map((m) => m[1]).sort();
};

describe("draft functions take exactly the payload's keys", () => {
  const [createPart] = readMigration("20261021020238_landed_cost_draft_functions.sql").split("create function public.save_landed_cost_draft");
  const savePart = OVERRIDES.slice(
    OVERRIDES.indexOf("create or replace function public.save_landed_cost_draft"),
    OVERRIDES.indexOf("create or replace function public.save_landed_cost_snapshot"),
  );
  const sorted = (o: object) => Object.keys(o).sort();

  const id = "00000000-0000-4000-8000-000000000001";
  const scenario = {
    label: "China", originCountry: "CN", supplierName: null, incoterm: "FOB", shipmentMode: "Sea", entryType: "auto",
    freightTotalUsd: null, freightBasis: "value", volumetricDivisor: null,
  };
  const draft = parseDraft({
    name: "W", entryDate: "2026-11-01", baselineRef: id,
    skuLines: [{ ref: id, id, skuCode: "A", htsCode: "6402993110", quantity: "1" }],
    scenarios: [{
      ref: id, id, ...scenario, otherCosts: [{ id, label: "x", amountUsd: "1" }],
      items: [{ skuRef: id, fobUnitPriceUsd: "1", overrides: [{ ref: "o1", id, kind: "replace", layerKey: "base", ratePercent: "0", reason: "x" }] }],
    }],
  });
  if (!draft.ok) throw new Error(draft.error);
  const save = savePayload(draft.data);

  test("save_landed_cost_draft", () => {
    expect(keys(savePart, "v_top")).toEqual(sorted(save));
    expect(keys(savePart, "v_line_keys")).toEqual(sorted(save.sku_lines[0]));
    expect(keys(savePart, "v_scenario_keys")).toEqual(sorted(save.scenarios[0]));
    expect(keys(savePart, "v_item_keys")).toEqual(sorted(save.scenarios[0].items[0]));
    expect(keys(savePart, "v_cost_keys")).toEqual(sorted(save.scenarios[0].other_costs[0]));
    expect(keys(savePart, "v_override_keys")).toEqual(sorted(save.scenarios[0].items[0].overrides[0]));
  });

  test("create_landed_cost_workspace", () => {
    const created = parseCreateWorkspace({ name: "W", entryDate: "2026-11-01", scenario }, "2026-10-21");
    if (!created.ok) throw new Error(created.error);
    const payload = createPayload(created.data);
    expect(keys(createPart, "v_top")).toEqual(sorted(payload));
    expect(keys(createPart, "v_scenario_keys")).toEqual(sorted(payload.scenario));
  });
});

// save_landed_cost_snapshot refuses any key it doesn't list (version 2 adds
// 'overrides' to items and 'manual' to duty layers), so its lists must be
// exactly the keys buildSnapshotRow writes.
describe("the lock function takes exactly the version's keys", () => {
  const snapPart = OVERRIDES.slice(OVERRIDES.indexOf("create or replace function public.save_landed_cost_snapshot"));
  const v2Additions = (name: string) => {
    const m = new RegExp(`${name} := ${name} \\|\\| '([^']*)'::text;`).exec(snapPart);
    if (!m) throw new Error(`no version 2 addition to ${name}`);
    return m[1];
  };
  const keysOf = (objects: object[]) => [...new Set(objects.flatMap((o) => Object.keys(o)))].sort();

  test("items, manual rates, duty layers and manual details", async () => {
    const { stubSupabase } = await import("@/lib/tariff/__fixtures__/supabase-stub");
    const { CALCULATED_ON } = await import("./__fixtures__/duty-tables");
    const { item, scenario, tables, workspace } = await import("./__fixtures__/workspace-builders");
    const { computeWorkspaceResult } = await import("./server-compute");
    const { buildSnapshotRow } = await import("./snapshot-schema");
    const w = workspace({
      id: "00000000-0000-4000-8000-000000000001", ownerId: "00000000-0000-4000-8000-0000000000a1",
      scenarios: [scenario({ items: [item({ overrides: [{
        id: "00000000-0000-4000-8000-000000000301", kind: "replace", layerKey: "base", label: null, ratePercent: "0", amountUsd: null,
        reason: "x", engineRateText: "3.4%", engineAmountUsd: "20.40", sortOrder: 0, setBy: "00000000-0000-4000-8000-0000000000a1",
        setAt: "2026-10-01T00:00:00Z", changedBy: "00000000-0000-4000-8000-0000000000a1", changedAt: "2026-10-01T00:00:00Z",
      }] })] })],
    });
    const built = buildSnapshotRow(w, await computeWorkspaceResult(stubSupabase(tables()), w, CALCULATED_ON));
    if (!built.ok) throw new Error(built.error);
    const row = built.row;
    const items = row.inputs.scenarios.flatMap((s) => s.items);
    const lines = row.result.origins.flatMap((o) => o.skus.flatMap((k) => k.duty.lines));
    expect([...keys(snapPart, "v_item_keys"), v2Additions("v_item_keys")].sort()).toEqual(keysOf(items));
    expect(keys(snapPart, "v_override_keys")).toEqual(keysOf(items.flatMap((i) => i.overrides)));
    // Every line key the function allows, and every key a line has, match
    // (the optional ones appear on additional-duty layers).
    expect([...keys(snapPart, "v_estimate_line_keys"), v2Additions("v_estimate_line_keys")].sort()).toEqual(
      expect.arrayContaining(keysOf(lines)),
    );
    expect(keys(snapPart, "v_manual_keys")).toEqual(keysOf(lines.flatMap((l) => (l.manual ? [l.manual] : []))));
  });
});

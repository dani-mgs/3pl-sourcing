import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createSupabaseStub } from "@/lib/tariff/__fixtures__/supabase-stub";
import { loadWorkspace } from "./server-workspace";

beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
afterEach(() => vi.restoreAllMocks());

const W = "00000000-0000-4000-8000-000000370001";
const OTHER = "00000000-0000-4000-8000-000000370002";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

// Rows as PostgREST returns them, numerics cast to text.
function tables(overrides: Record<string, Record<string, unknown>[]> = {}) {
  return {
    landed_cost_workspaces: [
      { id: W, owner_id: id(1), name: "Shoes 2027", entry_date: "2026-11-01", currency: "USD", baseline_scenario_id: id(21), created_at: "2026-10-21T00:00:00Z", updated_at: "2026-10-21T00:00:00Z" },
      { id: OTHER, owner_id: id(1), name: "Other", entry_date: "2026-11-01", currency: "USD", baseline_scenario_id: null, created_at: "2026-10-21T00:00:00Z", updated_at: "2026-10-21T00:00:00Z" },
    ],
    landed_cost_sku_lines: [
      { id: id(12), workspace_id: W, sku_code: "SKU-B", description: null, hts_code: "6402993110", quantity: "50", duty_quantity: null, duty_quantity_unit: null, sort_order: 1 },
      { id: id(11), workspace_id: W, sku_code: "SKU-A", description: "Sandal", hts_code: "0805100020", quantity: "100", duty_quantity: "120.5", duty_quantity_unit: "kg", sort_order: 0 },
      { id: id(19), workspace_id: OTHER, sku_code: "SKU-X", description: null, hts_code: "6402993110", quantity: "1", duty_quantity: null, duty_quantity_unit: null, sort_order: 0 },
    ],
    landed_cost_scenarios: [
      { id: id(22), workspace_id: W, label: "Vietnam", origin_country: "VN", supplier_name: null, incoterm: "FOB", shipment_mode: "Sea", entry_type: "auto", freight_total_usd: null, freight_basis: "chargeable_weight", volumetric_divisor: null, sort_order: 1 },
      { id: id(21), workspace_id: W, label: "China", origin_country: "CN", supplier_name: "Acme", incoterm: "FOB", shipment_mode: "Sea", entry_type: "formal", freight_total_usd: "854.00", freight_basis: "value", volumetric_divisor: "1000.000", sort_order: 0 },
    ],
    landed_cost_scenario_items: [
      { workspace_id: W, scenario_id: id(21), sku_line_id: id(12), fob_unit_price_usd: "8.0000", pcs_per_carton: null, carton_length_cm: null, carton_width_cm: null, carton_height_cm: null, carton_gross_kg: null },
      { workspace_id: W, scenario_id: id(21), sku_line_id: id(11), fob_unit_price_usd: "6.00", pcs_per_carton: "20", carton_length_cm: "60", carton_width_cm: "40", carton_height_cm: "31", carton_gross_kg: "10.000" },
    ],
    landed_cost_other_costs: [
      { id: id(31), workspace_id: W, scenario_id: id(21), label: "Trucking", amount_usd: "300.00", sort_order: 1 },
      { id: id(32), workspace_id: W, scenario_id: id(21), label: "Broker fee", amount_usd: "95.00", sort_order: 0 },
    ],
    landed_cost_rate_overrides: [
      { id: id(42), workspace_id: W, scenario_id: id(21), sku_line_id: id(11), kind: "add", layer_key: null, label: "Anti-dumping", rate_percent: null, amount_usd: "12.34", reason: "Case A-570-001", engine_rate_text: null, engine_amount_usd: null, sort_order: 1, set_by: id(1), set_at: "2026-10-21T10:00:00Z", changed_by: id(2), changed_at: "2026-10-21T11:00:00Z" },
      { id: id(41), workspace_id: W, scenario_id: id(21), sku_line_id: id(11), kind: "replace", layer_key: "section_301_china", label: null, rate_percent: "0", amount_usd: null, reason: "Exclusion", engine_rate_text: "+25%", engine_amount_usd: "150.00", sort_order: 0, set_by: id(1), set_at: "2026-10-21T09:00:00Z", changed_by: id(1), changed_at: "2026-10-21T09:00:00Z" },
    ],
    ...overrides,
  };
}

describe("loadWorkspace", () => {
  test("reads the workspace with its rows, in order, as exact decimal strings", async () => {
    const stub = createSupabaseStub(tables());
    const result = await loadWorkspace(stub.client, W);
    if (!result.ok) throw new Error(result.message);
    const w = result.workspace;
    expect([w.name, w.entryDate, w.currency, w.baselineScenarioId]).toEqual(["Shoes 2027", "2026-11-01", "USD", id(21)]);
    expect(w.skuLines.map((l) => [l.skuCode, l.quantity, l.dutyQuantity])).toEqual([
      ["SKU-A", "100", { value: "120.5", unit: "kg" }],
      ["SKU-B", "50", null],
    ]);
    expect(w.scenarios.map((s) => [s.label, s.isBaseline, s.freightTotalUsd, s.volumetricDivisor])).toEqual([
      ["China", true, "854.00", "1000.000"],
      ["Vietnam", false, null, null],
    ]);
    const china = w.scenarios[0];
    expect(china.items.map((i) => [i.skuLineId, i.fobUnitPriceUsd, i.cartonGrossKg])).toEqual([
      [id(11), "6.00", "10.000"],
      [id(12), "8.0000", null],
    ]);
    expect(china.otherCosts.map((c) => [c.label, c.amountUsd])).toEqual([["Broker fee", "95.00"], ["Trucking", "300.00"]]);
    expect(w.scenarios[1].items).toEqual([]);
    // Manual rates on their item, in order, exact; none on the other item.
    expect(china.items[0].overrides.map((o) => [o.kind, o.layerKey, o.label, o.ratePercent, o.amountUsd, o.engineRateText, o.engineAmountUsd, o.changedBy])).toEqual([
      ["replace", "section_301_china", null, "0", null, "+25%", "150.00", id(1)],
      ["add", null, "Anti-dumping", null, "12.34", null, null, id(2)],
    ]);
    expect(china.items[1].overrides).toEqual([]);
    expect(stub.total()).toBe(6);
  });

  test("only the requested workspace's rows", async () => {
    const result = await loadWorkspace(createSupabaseStub(tables()).client, OTHER);
    expect(result.ok && result.workspace.skuLines.map((l) => l.skuCode)).toEqual(["SKU-X"]);
    expect(result.ok && result.workspace.scenarios).toEqual([]);
  });

  test("an unknown or malformed id is not found, without reading", async () => {
    expect(await loadWorkspace(createSupabaseStub(tables()).client, id(99))).toMatchObject({ ok: false, code: "not_found" });
    const stub = createSupabaseStub(tables());
    expect(await loadWorkspace(stub.client, "not-a-uuid")).toMatchObject({ ok: false, code: "not_found" });
    expect(stub.total()).toBe(0);
  });

  test("a row that doesn't match the schema is invalid data, not half-read", async () => {
    const bad = tables();
    bad.landed_cost_scenario_items[0] = { ...bad.landed_cost_scenario_items[0], fob_unit_price_usd: 6 as never };
    expect(await loadWorkspace(createSupabaseStub(bad).client, W)).toMatchObject({ ok: false, code: "invalid_data" });
    const badIncoterm = tables();
    badIncoterm.landed_cost_scenarios[0] = { ...badIncoterm.landed_cost_scenarios[0], incoterm: "CIF" };
    expect(await loadWorkspace(createSupabaseStub(badIncoterm).client, W)).toMatchObject({ ok: false, code: "invalid_data" });
  });

  test("a database error says nothing about the database", async () => {
    const result = await loadWorkspace(createSupabaseStub(tables(), { failOn: "landed_cost_other_costs" }).client, W);
    expect(result).toEqual({ ok: false, code: "load_failed", message: "The workspace couldn't be loaded right now. Try again." });
  });
});

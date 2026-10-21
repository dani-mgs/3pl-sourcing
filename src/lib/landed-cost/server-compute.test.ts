import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { row } from "@/lib/tariff/__fixtures__/spec-builders";
import { createSupabaseStub, stubSupabase } from "@/lib/tariff/__fixtures__/supabase-stub";
import { CALCULATED_ON, dutyRowTables, dutyTables, htsLine, reviewedStatus } from "./__fixtures__/duty-tables";
import golden from "./__fixtures__/landed-cost.golden.json";
import { computeWorkspaceResult, type ScenarioOutcome, type SkuStatus, type WorkspaceResult } from "./server-compute";
import type { Scenario, ScenarioItem, SkuLine, Workspace } from "./workspace-schema";

// The server pipeline on saved inputs: what's missing per scenario x SKU line,
// one duty load for everything, totals only for complete scenarios (never a
// partial total), and the entry date check first. The duty data is the batch
// loader's stub tables (rates ILLUSTRATIVE); the China case reaches the Phase 1
// golden total through the real loader.

beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
afterEach(() => vi.restoreAllMocks());

const china = golden.scenarios.china_formal;
const L1 = "00000000-0000-4000-8000-000000000101";
const L2 = "00000000-0000-4000-8000-000000000102";
const S1 = "00000000-0000-4000-8000-000000000201";
const S2 = "00000000-0000-4000-8000-000000000202";

// 3.4% base (illustrative line) + China 301 25% + forced labour 12.5% on 600.00 = 245.40, as the golden case.
const tables = () =>
  dutyTables({
    hts_lines: [...dutyTables().hts_lines, htsLine("8504409541", "3.4%"), htsLine("0805100030", "1.9¢/kg")],
    ...dutyRowTables([
      row({ id: "cn301-85", program_key: "section_301_china", hts_scope: "listed", scope: [{ hts_prefix: "8504", article_description: null }] }),
      row({ id: "fl-all", program_key: "section_301_forced_labor", chapter99_heading: "9903.05.31", rate_pct: 12.5, origin_countries: ["CN", "VN"] }),
    ]),
    duty_program_review_status: [reviewedStatus("section_301_china"), reviewedStatus("section_301_forced_labor")],
  });

const skuLine = (over: Partial<SkuLine> = {}): SkuLine => ({
  id: L1, skuCode: "SKU-001", description: null, htsCode: "8504409541", quantity: "100", dutyQuantity: null, ...over,
});
const item = (over: Partial<ScenarioItem> = {}): ScenarioItem => ({
  skuLineId: L1, fobUnitPriceUsd: "6.00", pcsPerCarton: "10", cartonLengthCm: "40", cartonWidthCm: "30",
  cartonHeightCm: "20", cartonGrossKg: "5", ...over,
});
const scenario = (over: Partial<Scenario> = {}): Scenario => ({
  id: S1, label: "China", originCountry: "CN", supplierName: null, incoterm: "FOB", shipmentMode: "Sea", entryType: "formal",
  freightTotalUsd: china.freightTotalUsd, freightBasis: "chargeable_weight", volumetricDivisor: null, isBaseline: true,
  items: [item()], otherCosts: [], ...over,
});
const workspace = (over: Partial<Workspace> = {}): Workspace => ({
  id: "w1", ownerId: "u1", name: "Golden", entryDate: golden.entryDate, currency: "USD", baselineScenarioId: S1,
  createdAt: "2026-10-01T00:00:00+00:00", updatedAt: "2026-10-01T00:00:00+00:00", skuLines: [skuLine()], scenarios: [scenario()], ...over,
});

async function ready(w: Workspace): Promise<Extract<WorkspaceResult, { state: "ready" }>> {
  const result = await computeWorkspaceResult(stubSupabase(tables()), w, CALCULATED_ON);
  if (result.state !== "ready") throw new Error(`expected ready, got ${result.state}`);
  return result;
}
const sku = (o: ScenarioOutcome, id = L1): SkuStatus => o.skus.find((s) => s.skuLineId === id)!;

describe("a complete scenario", () => {
  test("reaches the Phase 1 China golden total, with duties from the real loader", async () => {
    const r = await ready(workspace());
    const s = r.scenarios[0];
    if (s.state !== "complete") throw new Error(s.state);
    const e = china.expected;
    expect(s.totals.skus[0]).toMatchObject({
      productCents: BigInt(e.productCents), freightCents: BigInt(e.freightCents), dutiesCents: BigInt(e.dutiesCents),
      mpfCents: BigInt(e.mpfCents), hmfCents: BigInt(e.hmfCents), otherCents: BigInt(e.otherCents),
    });
    expect(s.totals.totalCents).toBe(BigInt(e.totalCents));
    expect(s.totals.perUnitCents).toBe(BigInt(e.perUnitCents));
    expect(s.totals.entryFees.entryType).toBe(e.entryType);
    expect(s.shipment?.cartons).toBe(BigInt(10));
    expect(r.comparison?.baselineId).toBe(S1);
    expect(r.comparisonNote).toBeNull();
  });

  test("value basis without any packing is complete (packing isn't required)", async () => {
    const r = await ready(
      workspace({
        scenarios: [scenario({ freightBasis: "value", items: [item({ pcsPerCarton: null, cartonLengthCm: null, cartonWidthCm: null, cartonHeightCm: null, cartonGrossKg: null })] })],
      }),
    );
    expect(r.scenarios[0].state).toBe("complete");
    if (r.scenarios[0].state === "complete") expect(r.scenarios[0].shipment).toBeNull();
  });

  test("duties for every scenario x SKU line come from one load", async () => {
    const stub = createSupabaseStub(tables());
    const w = workspace({
      skuLines: [skuLine(), skuLine({ id: L2, skuCode: "SKU-002", htsCode: "6402993110" })],
      scenarios: [
        scenario({ items: [item(), item({ skuLineId: L2 })] }),
        scenario({ id: S2, label: "Vietnam", originCountry: "VN", isBaseline: false, items: [item(), item({ skuLineId: L2 })] }),
      ],
    });
    const result = await computeWorkspaceResult(stub.client, w, CALCULATED_ON);
    expect(result.state).toBe("ready");
    expect(stub.counts.get("hts_releases")).toBe(1);
    expect(stub.counts.get("customs_fees")).toBe(1);
  });
});

describe("inputs missing: no totals, and the list of what's missing", () => {
  test("a missing FOB price", async () => {
    const r = await ready(workspace({ scenarios: [scenario({ items: [item({ fobUnitPriceUsd: null })] })] }));
    const s = r.scenarios[0];
    expect(s.state).toBe("incomplete");
    expect(s).not.toHaveProperty("totals");
    expect(sku(s)).toMatchObject({ status: "inputs_missing", missing: ["fob_unit_price_usd"], duty: null });
    expect(r.comparison).toBeNull();
    expect(r.comparisonNote).toMatch(/baseline scenario isn't complete/);
  });

  test("a missing freight total", async () => {
    const r = await ready(workspace({ scenarios: [scenario({ freightTotalUsd: null })] }));
    expect(r.scenarios[0]).toMatchObject({ state: "incomplete", missing: ["freight_total_usd"] });
    expect(sku(r.scenarios[0]).status).toBe("ok");
  });

  test("a scenario x SKU line with no item row lists every item field; it's never skipped", async () => {
    const r = await ready(
      workspace({ skuLines: [skuLine(), skuLine({ id: L2, skuCode: "SKU-002" })], scenarios: [scenario({ items: [item()] })] }),
    );
    const s = r.scenarios[0];
    expect(s.state).toBe("incomplete");
    expect(s.skus).toHaveLength(2);
    expect(sku(s, L2)).toEqual({
      status: "inputs_missing", skuLineId: L2, dutyQuantityUnit: null, duty: null,
      missing: ["fob_unit_price_usd", "pcs_per_carton", "carton_length_cm", "carton_width_cm", "carton_height_cm", "carton_gross_kg"],
    });
    expect(sku(s, L1).status).toBe("ok");
  });

  test("missing packing on a weight basis still shows the SKU's duty", async () => {
    const r = await ready(workspace({ scenarios: [scenario({ items: [item({ cartonGrossKg: null })] })] }));
    const status = sku(r.scenarios[0]);
    if (status.status !== "inputs_missing") throw new Error(status.status);
    expect(status.missing).toEqual(["carton_gross_kg"]);
    expect(status.duty?.dutiesUsd).toBe(245.4);
  });

  test("a per-unit rate without a duty quantity asks for it in the rate's unit", async () => {
    const r = await ready(workspace({ skuLines: [skuLine({ htsCode: "0805100030" })], scenarios: [scenario({ originCountry: "MX" })] }));
    expect(sku(r.scenarios[0])).toMatchObject({
      status: "inputs_missing", missing: ["duty_quantity"], dutyQuantityUnit: { token: "kg", label: "kg" },
    });
    expect(r.scenarios[0].state).toBe("incomplete");
  });
});

describe("a duty error", () => {
  test("blocks the scenario's total, while the other SKU lines still show their duty", async () => {
    const r = await ready(
      workspace({
        skuLines: [skuLine(), skuLine({ id: L2, skuCode: "SKU-404", htsCode: "8504409599" })],
        scenarios: [scenario({ items: [item(), item({ skuLineId: L2 })] })],
      }),
    );
    const s = r.scenarios[0];
    expect(s.state).toBe("incomplete");
    expect(s).not.toHaveProperty("totals");
    expect(sku(s, L2)).toMatchObject({ status: "duty_error", code: "hts_not_found", missing: [] });
    const first = sku(s, L1);
    if (first.status !== "ok") throw new Error(first.status);
    expect(first.duty.dutiesUsd).toBe(245.4);
  });
});

describe("the entry date and the duty data", () => {
  test("an entry date out of range is its own state: nothing is loaded", async () => {
    const stub = createSupabaseStub(tables());
    const result = await computeWorkspaceResult(stub.client, workspace({ entryDate: "2026-09-01" }), CALCULATED_ON);
    expect(result).toMatchObject({
      state: "entry_date_out_of_range", entryDate: "2026-09-01", bounds: { min: "2026-10-01", max: "2027-10-03" },
    });
    if (result.state === "entry_date_out_of_range") expect(result.message).toMatch(/can't be earlier than/);
    expect(stub.total()).toBe(0);
  });

  test("no HTS release: duties unavailable, with the loader's message", async () => {
    const result = await computeWorkspaceResult(stubSupabase({ ...tables(), hts_releases: [] }), workspace(), CALCULATED_ON);
    expect(result).toMatchObject({ state: "duties_unavailable", code: "no_release" });
  });

  test("the fees can't be read: a plain message, no internals", async () => {
    const stub = createSupabaseStub(tables(), { failOn: "customs_fees" });
    const result = await computeWorkspaceResult(stub.client, workspace(), CALCULATED_ON);
    expect(result).toMatchObject({ state: "duties_unavailable", code: "load_failed" });
    if (result.state === "duties_unavailable") expect(result.message).not.toMatch(/relation|customs_fees/);
  });

  test("no SKU lines yet", async () => {
    expect((await computeWorkspaceResult(stubSupabase(tables()), workspace({ skuLines: [] }), CALCULATED_ON)).state).toBe("no_sku_lines");
  });
});

import { row } from "@/lib/tariff/__fixtures__/spec-builders";
import type { Scenario, ScenarioItem, SkuLine, Workspace } from "../workspace-schema";
import { dutyRowTables, dutyTables, htsLine, reviewedStatus } from "./duty-tables";
import golden from "./landed-cost.golden.json";

// Saved workspaces for the Landed Cost pipeline and page tests, on the batch
// loader's stub tables (rates ILLUSTRATIVE). The default is the Phase 1
// China golden case: one SKU, 100 x $6.00 FOB, Sea, formal entry, $854.00
// freight by chargeable weight. Moved from server-compute.test.ts. Test-only.

export const china = golden.scenarios.china_formal;
export const L1 = "00000000-0000-4000-8000-000000000101";
export const L2 = "00000000-0000-4000-8000-000000000102";
export const S1 = "00000000-0000-4000-8000-000000000201";
export const S2 = "00000000-0000-4000-8000-000000000202";

export const vietnam = golden.scenarios.vietnam_formal;

// China: 3.4% base (illustrative line) + China 301 25% + forced labour 12.5%
// on 600.00 = 245.40, as the golden case. Vietnam: the golden case's 10% of
// 800.00 = 80.00 is an unverified placeholder; with the shared HTS line's
// 3.4% base it needs the 6.6% row below.
export const tables = () =>
  dutyTables({
    hts_lines: [...dutyTables().hts_lines, htsLine("8504409541", "3.4%"), htsLine("0805100030", "1.9¢/kg")],
    ...dutyRowTables([
      row({ id: "cn301-85", program_key: "section_301_china", hts_scope: "listed", scope: [{ hts_prefix: "8504", article_description: null }] }),
      row({ id: "fl-cn", program_key: "section_301_forced_labor", chapter99_heading: "9903.05.31", rate_pct: 12.5, origin_countries: ["CN"] }),
      // ILLUSTRATIVE TEST VALUE, NOT A REAL TARIFF: only makes Vietnam's
      // duties 3.4% + 6.6% = 10%, the golden case's placeholder.
      row({ id: "vn-test-only", program_key: "section_301_forced_labor", chapter99_heading: "9903.05.31", rate_pct: 6.6, origin_countries: ["VN"], label: "Illustrative test value (not a real tariff)" }),
    ]),
    duty_program_review_status: [reviewedStatus("section_301_china"), reviewedStatus("section_301_forced_labor")],
  });

export const skuLine = (over: Partial<SkuLine> = {}): SkuLine => ({
  id: L1, skuCode: "SKU-001", description: null, htsCode: "8504409541", quantity: "100", dutyQuantity: null, ...over,
});
export const item = (over: Partial<ScenarioItem> = {}): ScenarioItem => ({
  skuLineId: L1, fobUnitPriceUsd: "6.00", pcsPerCarton: "10", cartonLengthCm: "40", cartonWidthCm: "30",
  cartonHeightCm: "20", cartonGrossKg: "5", overrides: [], ...over,
});
export const scenario = (over: Partial<Scenario> = {}): Scenario => ({
  id: S1, label: "China", originCountry: "CN", supplierName: null, incoterm: "FOB", shipmentMode: "Sea", entryType: "formal",
  freightTotalUsd: china.freightTotalUsd, freightBasis: "chargeable_weight", volumetricDivisor: null, isBaseline: true,
  items: [item()], otherCosts: [], ...over,
});
export const workspace = (over: Partial<Workspace> = {}): Workspace => ({
  id: "w1", ownerId: "u1", name: "Golden", entryDate: golden.entryDate, currency: "USD", baselineScenarioId: S1,
  createdAt: "2026-10-01T00:00:00+00:00", updatedAt: "2026-10-01T00:00:00+00:00", skuLines: [skuLine()], scenarios: [scenario()], ...over,
});

// The golden Vietnam case as a second origin: 100 x $8.00 FOB, Sea, formal
// entry, $1,053.00 freight.
export const vietnamScenario = (over: Partial<Scenario> = {}): Scenario =>
  scenario({
    id: S2, label: "Vietnam", originCountry: "VN", freightTotalUsd: vietnam.freightTotalUsd, isBaseline: false,
    items: [item({ fobUnitPriceUsd: "8.00" })], ...over,
  });

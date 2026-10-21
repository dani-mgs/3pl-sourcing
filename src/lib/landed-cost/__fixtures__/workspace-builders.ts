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

// 3.4% base (illustrative line) + China 301 25% + forced labour 12.5% on 600.00 = 245.40, as the golden case.
export const tables = () =>
  dutyTables({
    hts_lines: [...dutyTables().hts_lines, htsLine("8504409541", "3.4%"), htsLine("0805100030", "1.9¢/kg")],
    ...dutyRowTables([
      row({ id: "cn301-85", program_key: "section_301_china", hts_scope: "listed", scope: [{ hts_prefix: "8504", article_description: null }] }),
      row({ id: "fl-all", program_key: "section_301_forced_labor", chapter99_heading: "9903.05.31", rate_pct: 12.5, origin_countries: ["CN", "VN"] }),
    ]),
    duty_program_review_status: [reviewedStatus("section_301_china"), reviewedStatus("section_301_forced_labor")],
  });

export const skuLine = (over: Partial<SkuLine> = {}): SkuLine => ({
  id: L1, skuCode: "SKU-001", description: null, htsCode: "8504409541", quantity: "100", dutyQuantity: null, ...over,
});
export const item = (over: Partial<ScenarioItem> = {}): ScenarioItem => ({
  skuLineId: L1, fobUnitPriceUsd: "6.00", pcsPerCarton: "10", cartonLengthCm: "40", cartonWidthCm: "30",
  cartonHeightCm: "20", cartonGrossKg: "5", ...over,
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

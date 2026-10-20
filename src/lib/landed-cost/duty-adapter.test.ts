import { describe, expect, test } from "vitest";
import { parseDecimal } from "@/lib/tariff/rational";
import { row } from "@/lib/tariff/__fixtures__/spec-builders";
import { stubSupabase } from "@/lib/tariff/__fixtures__/supabase-stub";
import golden from "./__fixtures__/landed-cost.golden.json";
import { CALCULATED_ON, dutyRowTables, dutyTables, reviewedStatus } from "./__fixtures__/duty-tables";
import { toScenarioSkuDuty } from "./duty-adapter";
import type { FeeRowWithDates } from "./entry-fees";
import { computeScenarioTotals } from "./scenario-totals";
import { loadSkuDuties } from "./server-duty-batch";

// The Phase 1 golden China and Vietnam scenarios, with their duties from the
// loader on mocked rates that match the fixture: China 3.4% + 25% + 12.5%
// (reviewed Section 301 rows) on 600.00; Vietnam 10% on 800.00.

const CHINA_301 = row({ id: "cn301", program_key: "section_301_china", rate_pct: 25, origin_countries: ["CN"] });
const FORCED_LABOUR = row({ id: "fl", program_key: "section_301_forced_labor", chapter99_heading: "9903.05.31", rate_pct: 12.5, origin_countries: ["CN", "VN"] });
const tables = dutyTables({
  ...dutyRowTables([CHINA_301, FORCED_LABOUR]),
  duty_program_review_status: [reviewedStatus("section_301_china"), reviewedStatus("section_301_forced_labor")],
});

// Vietnam's mocked line is 10% with no forced-labour row for VN.
const VN_TABLES = dutyTables({
  ...dutyRowTables([CHINA_301, { ...FORCED_LABOUR, origin_countries: ["CN"] }]),
  duty_program_review_status: [reviewedStatus("section_301_china"), reviewedStatus("section_301_forced_labor")],
});

async function scenarioTotal(key: "china_formal" | "vietnam_formal", hts: string, origin: string, value: string, data = tables) {
  const batch = await loadSkuDuties(stubSupabase(data), { entryDate: CALCULATED_ON, lines: [{ lineId: "SKU-001", htsCode: hts, originCountry: origin, enteredValueUsd: value }] }, CALCULATED_ON);
  if (!batch.ok) throw new Error(batch.message);
  const duty = toScenarioSkuDuty(batch.lines[0]);
  if (!duty.ok) throw new Error(duty.message);
  const s = golden.scenarios[key];
  const sku = s.skus[0];
  const result = computeScenarioTotals({
    incoterm: s.incoterm,
    shipmentMode: "Sea",
    entryTypeChoice: "formal",
    freightTotalUsd: s.freightTotalUsd,
    freightBasis: "chargeable_weight",
    otherCosts: [],
    feeRows: golden.feeRows as unknown as FeeRowWithDates[],
    entryDate: golden.entryDate,
    skus: [{ skuId: sku.skuId, quantity: sku.quantity, unitPriceUsd: sku.unitPriceUsd, chargeableKg: parseDecimal("1"), ...duty.fields }],
  });
  if (!result.ok) throw new Error(result.error);
  return { fields: duty.fields, totals: result.totals };
}

describe("loader → computeScenarioTotals", () => {
  test("China reaches the golden total 1,734.73 (17.35 per unit)", async () => {
    const { fields, totals } = await scenarioTotal("china_formal", "8504409540", "CN", "600.00");
    expect(fields).toEqual({ dutiesUsd: "245.40", dutiesIncomplete: false, includesManualRate: false, unverified: false });
    expect(totals.totalCents).toBe(BigInt(golden.scenarios.china_formal.expected.totalCents));
    expect(totals.perUnitCents).toBe(BigInt(golden.scenarios.china_formal.expected.perUnitCents));
  });

  test("Vietnam reaches the golden total 1,968.58 (19.69 per unit)", async () => {
    const { fields, totals } = await scenarioTotal("vietnam_formal", "8504409580", "VN", "800.00", VN_TABLES);
    expect(fields.dutiesUsd).toBe("80.00");
    expect(totals.totalCents).toBe(BigInt(golden.scenarios.vietnam_formal.expected.totalCents));
    expect(totals.perUnitCents).toBe(BigInt(golden.scenarios.vietnam_formal.expected.perUnitCents));
  });

  test("an incomplete duty carries into the scenario's status", async () => {
    // No rows: both Section 301 programs are named, not counted.
    const { fields, totals } = await scenarioTotal("china_formal", "8504409540", "CN", "600.00", dutyTables());
    expect(fields.dutiesIncomplete).toBe(true);
    expect(totals.status.incomplete).toBe(true);
  });

  test("a line error passes through unchanged", async () => {
    const batch = await loadSkuDuties(stubSupabase(tables), { entryDate: CALCULATED_ON, lines: [{ lineId: "X", htsCode: "6402993199", originCountry: "CN", enteredValueUsd: "1" }] }, CALCULATED_ON);
    if (!batch.ok) throw new Error(batch.message);
    expect(toScenarioSkuDuty(batch.lines[0])).toBe(batch.lines[0]);
  });
});

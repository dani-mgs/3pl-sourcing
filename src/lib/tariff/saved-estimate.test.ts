import { afterEach, describe, expect, test, vi } from "vitest";
import { rowToSavedEstimate } from "./saved-estimate";

const row = {
  id: "3f1c3b3e-6c1d-4b1e-9d36-1d8b1f0f9a10",
  created_at: "2026-10-02T12:00:00+00:00",
  created_by: "00000000-0000-4000-8000-0000000000a1",
  label: "Client A",
  as_of_date: "2026-10-02",
  hts_code: "0805100020",
  hts_description: "Temple oranges",
  hts_ancestor_descriptions: ["Citrus fruit, fresh or dried:", "Oranges"],
  hts_release_name: "2026HTSRev20",
  hts_release_title: "Revision 20 (2026)",
  hts_release_start_date: "2026-09-28",
  rate_column: "general",
  rate_text: "1.9¢/kg",
  special_rate_text: null,
  origin_country: "ZA",
  shipment_mode: "Sea",
  customs_value_original: 10000,
  original_currency: "USD",
  exchange_rate_to_usd: 1,
  exchange_rate_source: null,
  exchange_rate_date: null,
  customs_value_usd: 10000,
  quantity: 20000,
  quantity_unit: "kg",
  base_duty_usd: 380,
  fees_usd: 47.14,
  total_usd: 427.14,
  lines: [
    { kind: "duty", code: "general", label: "Base duty (general rate)", rateText: "1.9¢/kg", amountUsd: 380, detail: "20,000 kg", sourceLabel: "HTSUS Revision 20 (2026) (USITC)", sourceUrl: "https://hts.usitc.gov/", effectiveFrom: "2026-09-28" },
  ],
  warnings: [
    { programKey: "section_301_forced_labor", name: "Section 301 (forced labour)", text: "May apply.", sourceLabel: "FR 2026-15181", sourceUrl: "https://www.federalregister.gov/", indicativePct: 12.5 },
  ],
};

afterEach(() => vi.restoreAllMocks());

describe("rowToSavedEstimate", () => {
  test("maps a locked row back to the result view", () => {
    const saved = rowToSavedEstimate(row);
    expect(saved).toMatchObject({
      id: row.id,
      label: "Client A",
      estimate: {
        htsCode: "0805100020",
        release: { name: "2026HTSRev20", release_start_date: "2026-09-28" },
        quantityUsed: { value: 20000, unitLabel: "kg" },
        totalUsd: 427.14,
        warnings: [{ programKey: "section_301_forced_labor", indicativePct: 12.5 }],
      },
    });
  });

  test("a malformed snapshot is reported as unavailable, not thrown", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(rowToSavedEstimate({ ...row, lines: [{ kind: "bogus" }] })).toBeNull();
  });
});

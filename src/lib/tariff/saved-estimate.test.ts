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

describe("rowToSavedEstimate: entry date", () => {
  test("a saved entry date is kept separately from the calculation date", () => {
    const saved = rowToSavedEstimate({ ...row, entry_date: "2026-11-08" });
    expect(saved?.estimate).toMatchObject({ asOfDate: "2026-10-02", entryDate: "2026-11-08" });
  });

  test("a row without one (read before the backfill) shows its calculation date", () => {
    expect(rowToSavedEstimate(row)?.estimate).toMatchObject({ asOfDate: "2026-10-02", entryDate: "2026-10-02" });
    expect(rowToSavedEstimate({ ...row, entry_date: null })?.estimate.entryDate).toBe("2026-10-02");
  });
});

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

  test("a row saved before additional duties existed reads as none", () => {
    expect(rowToSavedEstimate(row)!.estimate).toMatchObject({ additionalDutiesUsd: 0, dutyReviews: [] });
  });

  test("additional-duty lines, pending warnings and the review snapshot round-trip", () => {
    const saved = rowToSavedEstimate({
      ...row,
      base_duty_usd: 600,
      additional_duties_usd: 1000,
      fees_usd: 47.14,
      total_usd: 1647.14,
      lines: [
        ...row.lines,
        { kind: "additional", code: "section_301_forced_labor", label: "Section 301 (forced labour) (India)", rateText: "+10%", amountUsd: 1000, detail: "10% of $10,000.00", sourceLabel: "FR 2026-15181", sourceUrl: "https://www.federalregister.gov/", effectiveFrom: "2026-07-24", heading: "9903.05.44", effectiveTo: null, legalStatus: "In force", sourceCheckedOn: "2026-10-02", notes: [] },
      ],
      warnings: [{ programKey: "section_301_china", name: "Section 301 (China)", text: "May apply.", sourceLabel: "CBP", sourceUrl: "https://www.cbp.gov/", kind: "not_loaded", indicativePct: null, hint: null, counted: true }],
      duty_reviews: [{ programKey: "section_301_forced_labor", name: "Section 301 (forced labour)", status: "reviewed", reviewedAt: "2026-10-02T09:00:00Z", reviewedByName: "Dani", staleReason: null }],
    });
    expect(saved!.estimate).toMatchObject({
      additionalDutiesUsd: 1000,
      totalUsd: 1647.14,
      dutyReviews: [{ reviewedByName: "Dani" }],
    });
    expect(saved!.estimate.lines[1]).toMatchObject({ kind: "additional", heading: "9903.05.44" });
  });

  test("a malformed snapshot is reported as unavailable, not thrown", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(rowToSavedEstimate({ ...row, lines: [{ kind: "bogus" }] })).toBeNull();
  });
});

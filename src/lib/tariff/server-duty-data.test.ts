import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { API_ROW_LIMIT, RowLimitError, loadAdditionalDutyData } from "./server-duty-data";
import { buildEstimate } from "./server-estimate";
import { FEES, program, row } from "./__fixtures__/spec-builders";
import { stubSupabase } from "./__fixtures__/supabase-stub";

// The unpaged reads (additional duties, Chapter 99 changes since the earliest
// review) fail at the API row limit instead of using possibly cut-off data;
// below it nothing changes.

beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
afterEach(() => vi.restoreAllMocks());

const ON = "2026-10-02";

// Rows for an origin no estimate here uses, so they never apply.
const duties = (n: number) =>
  Array.from({ length: n }, (_, i) =>
    Object.fromEntries(Object.entries(row({ id: `d-${i}`, origin_countries: ["ZZ"] })).filter(([key]) => key !== "scope")),
  );
const changes = (n: number) => Array.from({ length: n }, (_, i) => ({ hts_code: `990388${String(i).padStart(4, "0")}`, detected_at: "2026-09-25T00:00:00Z" }));
const reviewed = [{ program_key: "section_301_china", review_status: "reviewed", last_reviewed_at: "2026-09-20T09:00:00Z", last_reviewed_by: null }];

function tables(extra: Record<string, unknown[]>) {
  return {
    hts_releases: [{ id: "rel", name: "TEST", title: null, release_start_date: "2026-09-28", status: "current" }],
    hts_lines: [{ release_id: "rel", hts_code: "6402993110", description: "Line", ancestor_descriptions: [], units: ["kg"], general_rate: "6%", special_rate: null, other_rate: "35%" }],
    customs_fees: FEES,
    hts_column2_countries: [],
    duty_programs: [program("section_301_china", "Section 301 (China)", { trigger_origins: ["CN"] })],
    additional_duties: [],
    additional_duty_scope: [],
    duty_program_review_status: [],
    hts_chapter99_changes: [],
    profiles: [],
    ...extra,
  } as Record<string, Record<string, unknown>[]>;
}

const estimate = (t: ReturnType<typeof tables>) =>
  buildEstimate(
    stubSupabase(t),
    {
      htsDigits: "6402993110", originCountry: "CN", shipmentMode: "Sea", customsValue: "10000", currency: "USD", exchangeRate: "1",
      exchangeRateSource: null, exchangeRateDate: null, quantity: null, label: null, entryDate: ON, deductionUsd: null,
    },
    ON,
  );

describe("row-limit guard (calculator path)", () => {
  test("additional duties below the limit: unchanged", async () => {
    const result = await estimate(tables({ additional_duties: duties(API_ROW_LIMIT - 1) }));
    expect(result).toMatchObject({ ok: true, estimate: { baseDutyUsd: 600, additionalDutiesUsd: 0 } });
  });

  test("additional duties at the limit: the generic error, not part of the data", async () => {
    const t = tables({ additional_duties: duties(API_ROW_LIMIT) });
    await expect(loadAdditionalDutyData(stubSupabase(t), "6402993110", ON)).rejects.toBeInstanceOf(RowLimitError);
    expect(await estimate(t)).toEqual({ ok: false, error: "An unexpected error occurred." });
  });

  test("Chapter 99 changes below the limit: unchanged", async () => {
    const result = await estimate(tables({ duty_program_review_status: reviewed, hts_chapter99_changes: changes(API_ROW_LIMIT - 1) }));
    expect(result.ok).toBe(true);
  });

  test("Chapter 99 changes at the limit: the generic error", async () => {
    const t = tables({ duty_program_review_status: reviewed, hts_chapter99_changes: changes(API_ROW_LIMIT) });
    await expect(loadAdditionalDutyData(stubSupabase(t), "6402993110", ON)).rejects.toBeInstanceOf(RowLimitError);
    expect(await estimate(t)).toEqual({ ok: false, error: "An unexpected error occurred." });
  });
});

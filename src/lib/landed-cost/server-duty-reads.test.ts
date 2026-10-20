import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { candidatePrefixes, scopeLinesFor } from "@/lib/tariff/server-duty-data";
import { createSupabaseStub } from "@/lib/tariff/__fixtures__/supabase-stub";
import { CALCULATED_ON, dutyTables } from "./__fixtures__/duty-tables";
import { loadSkuDuties } from "./server-duty-batch";
import { GROUP_SIZE, MAX_PAGES, PAGE_SIZE, TooMuchDataError, readHtsLines, readScope } from "./server-duty-reads";

beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
afterEach(() => vi.restoreAllMocks());

const scopeRow = (n: number, prefix: string) => ({
  id: `s-${String(n).padStart(6, "0")}`,
  duty_id: `d-${n % 7}`,
  hts_prefix: prefix,
  article_description: null,
  excluded: false,
});

describe("paging", () => {
  test("reads every page until a short one", async () => {
    const rows = Array.from({ length: 2 * PAGE_SIZE + 500 }, (_, i) => scopeRow(i, "6402"));
    const stub = createSupabaseStub({ additional_duty_scope: rows });
    const scope = await readScope(stub.client as never, ["6402993110"]);
    expect(scope).toHaveLength(rows.length);
    expect(stub.counts.get("additional_duty_scope")).toBe(3);
  });

  test(`fails past ${MAX_PAGES} pages rather than use cut-off data`, async () => {
    const rows = Array.from({ length: MAX_PAGES * PAGE_SIZE }, (_, i) => scopeRow(i, "6402"));
    const stub = createSupabaseStub({ additional_duty_scope: rows });
    await expect(readScope(stub.client as never, ["6402993110"])).rejects.toBeInstanceOf(TooMuchDataError);
  });

  test("the loader turns that into load_failed", async () => {
    const rows = Array.from({ length: MAX_PAGES * PAGE_SIZE }, (_, i) => scopeRow(i, "6402"));
    const stub = createSupabaseStub(dutyTables({ additional_duty_scope: rows }));
    const result = await loadSkuDuties(
      stub.client,
      { entryDate: CALCULATED_ON, lines: [{ lineId: "L1", htsCode: "6402993110", originCountry: "CN", enteredValueUsd: "100" }] },
      CALCULATED_ON,
    );
    expect(result).toMatchObject({ ok: false, code: "load_failed" });
  });
});

describe(`grouping long lists by ${GROUP_SIZE}`, () => {
  // 100 distinct codes in 100 different headings: 700 prefixes.
  const codes = Array.from({ length: 100 }, (_, i) => `${String(1000 + i * 37).padStart(4, "0")}100010`);
  const rows = codes.flatMap((code, i) => [scopeRow(2 * i, code.slice(0, 4)), scopeRow(2 * i + 1, code.slice(0, 8))]);

  test("splits the scope read into groups and finds the same lines as one code at a time", async () => {
    const stub = createSupabaseStub({ additional_duty_scope: rows });
    const scope = await readScope(stub.client as never, codes);
    const prefixes = new Set(codes.flatMap(candidatePrefixes)).size;
    expect(stub.counts.get("additional_duty_scope")).toBe(Math.ceil(prefixes / GROUP_SIZE));
    for (const code of codes.slice(0, 5)) {
      const alone = await readScope(createSupabaseStub({ additional_duty_scope: rows }).client as never, [code]);
      expect(scopeLinesFor(code, scope)).toEqual(scopeLinesFor(code, alone));
    }
  });

  test("a line found by both scope reads is kept once", async () => {
    const stub = createSupabaseStub({ additional_duty_scope: [scopeRow(1, "8471300100")] });
    expect(await readScope(stub.client as never, ["84713001", "8471300100"])).toHaveLength(1);
  });

  test("HTS lines: exact codes and the 10-digit lines under 8-digit codes", async () => {
    const tables = dutyTables();
    const stub = createSupabaseStub(tables);
    const lines = await readHtsLines(stub.client as never, "rel-20", ["6402993110", "08051000"]);
    expect(lines.map((l) => l.hts_code).sort()).toEqual(["0805100020", "0805100050", "6402993110"]);
    expect(stub.counts.get("hts_lines")).toBe(1);
  });
});

describe("row-limit guard (batch path)", () => {
  const request = { entryDate: CALCULATED_ON, lines: [{ lineId: "L1", htsCode: "6402993110", originCountry: "CN", enteredValueUsd: "100" }] };
  const duties = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `d-${i}`, program_key: "section_301_china", origin_countries: ["ZZ"], effective_from: "2020-01-01", effective_to: null, chapter99_heading: "9903.88.03", excludes_programs: [] }));
  const changes = (n: number) => Array.from({ length: n }, (_, i) => ({ hts_code: `990388${String(i).padStart(4, "0")}`, detected_at: "2026-09-25T00:00:00Z" }));
  const reviewed = [{ program_key: "section_301_china", review_status: "reviewed", last_reviewed_at: "2026-09-20T09:00:00Z", last_reviewed_by: null }];
  const run = (extra: Record<string, unknown[]>) =>
    loadSkuDuties(createSupabaseStub(dutyTables(extra as never)).client, request, CALCULATED_ON);

  test("below the limit: unchanged", async () => {
    expect((await run({ additional_duties: duties(PAGE_SIZE - 1) })).ok).toBe(true);
    expect((await run({ duty_program_review_status: reviewed, hts_chapter99_changes: changes(PAGE_SIZE - 1) })).ok).toBe(true);
  });

  test("additional duties at the limit: load_failed", async () => {
    expect(await run({ additional_duties: duties(PAGE_SIZE) })).toMatchObject({ ok: false, code: "load_failed" });
  });

  test("Chapter 99 changes at the limit: load_failed", async () => {
    expect(await run({ duty_program_review_status: reviewed, hts_chapter99_changes: changes(PAGE_SIZE) })).toMatchObject({ ok: false, code: "load_failed" });
  });
});

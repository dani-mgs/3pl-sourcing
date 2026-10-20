import { describe, expect, test } from "vitest";
import {
  MAX_DISTINCT_HTS,
  MAX_DISTINCT_ORIGINS,
  MAX_DUTY_LINES,
  parseDutyRequest,
  type DutyLineRequest,
  type ValidLine,
} from "./duty-request";

const ON = "2026-10-02";
const line = (overrides: Partial<DutyLineRequest> = {}): DutyLineRequest => ({
  lineId: "L1",
  htsCode: "6402.99.31.10",
  originCountry: "cn",
  enteredValueUsd: "1,500.00",
  ...overrides,
});

function items(lines: DutyLineRequest[]) {
  const parsed = parseDutyRequest({ entryDate: ON, lines }, ON);
  if (!parsed.ok) throw new Error(parsed.message);
  return parsed.items;
}
const codeOf = (item: ValidLine | { ok: false; code: string }) => ("ok" in item ? item.code : "ok");

describe("parseDutyRequest", () => {
  test("normalises a valid line", () => {
    expect(items([line({ dutyQuantity: "1,200.5", dutyQuantityUnit: "kg" })])).toEqual([
      { lineId: "L1", digits: "6402993110", originCountry: "CN", enteredValueUsd: "1500.00", quantity: { value: "1200.5", unit: "kg" } },
    ]);
  });

  test.each([
    ["blank line id", { lineId: " " }, "invalid_line_id"],
    ["long line id", { lineId: "x".repeat(101) }, "invalid_line_id"],
    ["bad HTS", { htsCode: "12" }, "invalid_hts"],
    ["unknown origin", { originCountry: "ZZ" }, "invalid_origin"],
    ["US origin", { originCountry: "US" }, "invalid_origin"],
    ["zero value", { enteredValueUsd: "0" }, "invalid_value"],
    ["3-decimal value", { enteredValueUsd: "1.005" }, "invalid_value"],
    ["quantity without a unit", { dutyQuantity: "10" }, "invalid_quantity"],
    ["unit without a quantity", { dutyQuantityUnit: "kg" }, "invalid_quantity"],
    ["unknown unit", { dutyQuantity: "10", dutyQuantityUnit: "pieces" }, "invalid_quantity"],
    ["5-decimal quantity", { dutyQuantity: "1.12345", dutyQuantityUnit: "kg" }, "invalid_quantity"],
  ] as [string, Partial<DutyLineRequest>, string][])("%s → %s, other lines kept", (_name, bad, code) => {
    expect(items([line(), line({ lineId: "L2", ...bad })]).map(codeOf)).toEqual(["ok", code]);
  });

  test("a duplicated id fails every line that has it", () => {
    expect(items([line({ lineId: "A" }), line({ lineId: "B" }), line({ lineId: "A" })]).map(codeOf)).toEqual([
      "duplicate_line_id",
      "ok",
      "duplicate_line_id",
    ]);
  });

  test(`at most ${MAX_DUTY_LINES} lines, ${MAX_DISTINCT_HTS} HTS codes and ${MAX_DISTINCT_ORIGINS} origins`, () => {
    const many = (n: number, f: (i: number) => Partial<DutyLineRequest>) => Array.from({ length: n }, (_, i) => line({ lineId: `L${i}`, ...f(i) }));
    const parse = (lines: DutyLineRequest[]) => parseDutyRequest({ entryDate: ON, lines }, ON);
    expect(parse(many(MAX_DUTY_LINES, () => ({}))).ok).toBe(true);
    expect(parse(many(MAX_DUTY_LINES + 1, () => ({})))).toMatchObject({ ok: false, code: "too_many_lines" });
    const code = (i: number) => `${String(1000 + i).padStart(4, "0")}100010`;
    expect(parse(many(MAX_DISTINCT_HTS, (i) => ({ htsCode: code(i) }))).ok).toBe(true);
    expect(parse(many(MAX_DISTINCT_HTS + 1, (i) => ({ htsCode: code(i) })))).toMatchObject({ ok: false, code: "too_many_lines" });
    const origins = ["CN", "VN", "MX", "IN", "TH", "ID"];
    expect(parse(many(MAX_DISTINCT_ORIGINS, (i) => ({ originCountry: origins[i] }))).ok).toBe(true);
    expect(parse(many(MAX_DISTINCT_ORIGINS + 1, (i) => ({ originCountry: origins[i] })))).toMatchObject({ ok: false, code: "too_many_lines" });
  });

  test("no lines", () => {
    expect(parseDutyRequest({ entryDate: ON, lines: [] }, ON)).toMatchObject({ ok: false, code: "no_lines" });
  });

  test("entry dates follow the estimate rule: yesterday to 366 days ahead, never blank", () => {
    const parse = (entryDate: string) => parseDutyRequest({ entryDate, lines: [line()] }, ON);
    expect(parse("2026-10-01").ok).toBe(true);
    expect(parse("2027-10-03").ok).toBe(true);
    for (const bad of ["2026-09-30", "2027-10-04", "", "2026-02-30"]) {
      expect(parse(bad)).toMatchObject({ ok: false, code: "invalid_entry_date" });
    }
  });
});

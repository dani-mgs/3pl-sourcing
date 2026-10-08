import { describe, expect, test } from "vitest";
import { canChange, groupItems, progress, progressText } from "./checklist";
import { buildHint, currentRateHint, type DutyRateRow, type HintData } from "./hints";
import { parseSetItem } from "./parse-checklist-input";

const ID = "6f1d5b7e-3c0a-4f64-9a66-0d0c3a1b2c3d";

describe("progress and grouping", () => {
  test("counts ticked items, overall and per group, in sort order", () => {
    const items = [
      { group_key: "B", sort_order: 20, done: true },
      { group_key: "A", sort_order: 10, done: false },
      { group_key: "B", sort_order: 10, done: false },
    ];
    expect(progressText(progress(items))).toBe("1 of 3 done");
    const groups = groupItems(items);
    expect(groups.map((g) => [g.group, g.title, progressText(progress(g.items))])).toEqual([
      ["A", "Access", "0 of 1 done"],
      ["B", "Review pending programs", "1 of 2 done"],
    ]);
    expect(groups[1].items.map((i) => i.sort_order)).toEqual([10, 20]);
  });
});

describe("canChange mirrors the database rule", () => {
  const editor = { isAdmin: false, canEditTariffData: true };
  const admin = { isAdmin: true, canEditTariffData: true };
  const plain = { isAdmin: false, canEditTariffData: false };
  test("editor items: editors and admins; admin-only items: admins", () => {
    expect([plain, editor, admin].map((p) => canChange({ editable_by: "editor" }, p))).toEqual([false, true, true]);
    expect([plain, editor, admin].map((p) => canChange({ editable_by: "admin" }, p))).toEqual([false, false, true]);
  });
});

describe("parseSetItem", () => {
  const ok = { itemId: ID, done: true, note: "  checked  ", version: 0 };
  test("trims the note, and an empty one is null", () => {
    expect(parseSetItem(ok)).toEqual({ ok: true, data: { itemId: ID, done: true, note: "checked", version: 0 } });
    expect(parseSetItem({ ...ok, note: "   " })).toMatchObject({ ok: true, data: { note: null } });
  });
  test.each([
    ["a bad id", { ...ok, itemId: "nope" }],
    ["a null tick state", { ...ok, done: null }],
    ["a string tick state", { ...ok, done: "true" }],
    ["a note over 500 characters", { ...ok, note: "x".repeat(501) }],
    ["a missing version", { ...ok, version: undefined }],
    ["a fractional version", { ...ok, version: 1.5 }],
    ["a negative version", { ...ok, version: -1 }],
  ])("rejects %s", (_name, raw) => {
    expect(parseSetItem(raw).ok).toBe(false);
  });
  test("a 500-character note is accepted", () => {
    expect(parseSetItem({ ...ok, note: "x".repeat(500) }).ok).toBe(true);
  });
});

describe("live hints come from data, never text of their own", () => {
  const today = "2026-10-08";
  const row = (over: Partial<DutyRateRow>): DutyRateRow => ({
    chapter99_heading: "9903.82.22",
    rate_type: "unconfirmed",
    rate_pct: "15.0000",
    effective_from: "2026-06-08",
    effective_to: null,
    ...over,
  });
  const data: HintData = {
    programs: [
      { program_key: "section_301_china", review_status: "pending_review", row_count: 18 },
      { program_key: "section_232_drones", review_status: "not_loaded", row_count: 0 },
    ],
    dutyRows: [row({})],
  };

  test("review status and row counts are read from the program", () => {
    expect(buildHint({ hint_kind: "program_review", hint_ref: "section_301_china" }, data, today)).toEqual({ kind: "review", status: "pending_review" });
    expect(buildHint({ hint_kind: "program_rows", hint_ref: "section_232_drones" }, data, today)).toEqual({ kind: "rows", count: 0 });
  });
  test("an unknown program, or an item with no hint, shows nothing", () => {
    expect(buildHint({ hint_kind: "program_rows", hint_ref: "section_232_buses" }, data, today)).toBeNull();
    expect(buildHint({ hint_kind: null, hint_ref: null }, data, today)).toBeNull();
  });
  test("item C: the rate and its status come from the row", () => {
    expect(currentRateHint("9903.82.22", [row({})], today)).toEqual({ kind: "rate", text: "+15%, rate unconfirmed" });
    expect(currentRateHint("9903.82.22", [row({ rate_type: "add", rate_pct: 25 })], today)).toEqual({ kind: "rate", text: "+25%, confirmed" });
  });
  test("item C: no row, an ended row or a not-yet-started row shows nothing", () => {
    expect(currentRateHint("9903.82.22", [], today)).toBeNull();
    expect(currentRateHint("9903.82.22", [row({ effective_to: "2026-09-30" })], today)).toBeNull();
    expect(currentRateHint("9903.82.22", [row({ effective_from: "2026-12-01" })], today)).toBeNull();
    expect(currentRateHint("9903.99.99", [row({})], today)).toBeNull();
  });
});

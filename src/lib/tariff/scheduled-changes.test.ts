import { describe, expect, test } from "vitest";
import { seedRows } from "./__fixtures__/seed-rows";
import type { DutyRow } from "./additional-duties";
import { keyDates } from "./key-dates";
import { countryName } from "./countries";
import { scheduledChanges, SCHEDULED_CHANGE_WINDOW_DAYS } from "./scheduled-changes";

// On the real seeded rows (data/tariff/2b-china301-232): the chassis and
// crane rows start 2026-11-10 (+100%, unconfirmed) and the two USTR exclusions
// end after 2026-11-09, so they change on 2026-11-10.

const ROWS: DutyRow[] = [...seedRows("data/tariff/2a-origin-301"), ...seedRows("data/tariff/2b-china301-232")];
const REVIEWED = new Map([
  ["section_301_china", "Section 301 (China)"],
  ["section_301_forced_labor", "Section 301 (forced labour)"],
  ["section_232_metals", "Section 232 (steel, aluminium, copper)"],
]);

const run = (htsCode: string, origin: string, entryDate: string, reviewedPrograms = REVIEWED) =>
  scheduledChanges({ rows: ROWS, reviewedPrograms, originCountry: origin, htsCode, entryDate });

describe("scheduledChanges", () => {
  test("the window is 45 days", () => {
    expect(SCHEDULED_CHANGE_WINDOW_DAYS).toBe(45);
  });

  test("a row that starts within 45 days after the entry date: chassis from China", () => {
    const [change] = run("8716390090", "CN", "2026-10-20");
    expect(change).toMatchObject({
      programKey: "section_301_china",
      programName: "Section 301 (China)",
      date: "2026-11-10",
      kind: "starts",
      headings: ["9903.91.12"],
    });
    expect(change.description).toContain("+100%, rate unconfirmed");
  });

  test("window edges: the 45th day counts, the 46th doesn't; the entry date itself isn't 'after'", () => {
    // 2026-11-10 is entry + 45 when the entry date is 2026-09-26.
    expect(run("8716390090", "CN", "2026-09-26").map((c) => c.date)).toEqual(["2026-11-10"]);
    expect(run("8716390090", "CN", "2026-09-25")).toEqual([]);
    expect(run("8716390090", "CN", "2026-11-09").map((c) => c.date)).toEqual(["2026-11-10"]);
    expect(run("8716390090", "CN", "2026-11-10")).toEqual([]);
    expect(run("8716390090", "CN", "2026-12-01")).toEqual([]);
  });

  test("a row in force at entry that ends within the window: the USTR exclusions, changing the day after Nov 9", () => {
    const changes = run("8504409580", "CN", "2026-10-07");
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ programKey: "section_301_china", date: "2026-11-10", kind: "ends" });
    expect(changes[0].headings).toEqual(expect.arrayContaining(["9903.88.69"]));
  });

  test("rows that end on the entry date change the next day, so they count; rows already ended don't", () => {
    expect(run("8504409580", "CN", "2026-11-09").map((c) => c.date)).toEqual(["2026-11-10"]);
    expect(run("8504409580", "CN", "2026-11-10")).toEqual([]);
  });

  test("two rows of one program changing on the same day are one warning", () => {
    const changes = run("8504409580", "CN", "2026-10-07");
    expect(changes.filter((c) => c.kind === "ends")).toHaveLength(1);
  });

  test("only for the origin and HTS code of the estimate", () => {
    expect(run("8716390090", "VN", "2026-10-20")).toEqual([]);
    expect(run("6402993110", "CN", "2026-10-20")).toEqual([]);
  });

  test("only for programs that bear on the estimate and have been reviewed", () => {
    expect(run("8716390090", "CN", "2026-10-20", new Map())).toEqual([]);
    expect(run("8716390090", "CN", "2026-10-20", new Map([["section_232_metals", "232"]]))).toEqual([]);
  });

  test("no scheduled data: nothing", () => {
    expect(scheduledChanges({ rows: [], reviewedPrograms: REVIEWED, originCountry: "CN", htsCode: "8716390090", entryDate: "2026-10-20" })).toEqual([]);
  });
});

describe("keyDates", () => {
  const programNames = new Map([...REVIEWED, ["section_301_brazil", "Section 301 (Brazil)"]]);
  const reviewStatus = new Map([["section_301_china", "reviewed" as const]]);
  const list = (today: string) => keyDates({ rows: ROWS, today, programNames, reviewStatus, countryName });

  test("lists dated changes from today on, sorted by the day they take effect", () => {
    const dates = list("2026-10-07");
    expect(dates.map((d) => [d.date, d.kind, d.heading])).toEqual([
      ["2026-11-10", "ends", "9903.88.69"],
      ["2026-11-10", "ends", "9903.88.70"],
      ["2026-11-10", "starts", "9903.91.12"],
      ["2026-11-10", "starts", "9903.91.14"],
    ]);
    expect(dates[2]).toMatchObject({ programName: "Section 301 (China)", change: "+100%, rate unconfirmed", covers: "China; listed products", counted: true });
  });

  test("a row that already ended or started isn't listed; a row ending today still is (it changes tomorrow)", () => {
    expect(list("2026-11-09").map((d) => d.kind)).toEqual(["ends", "ends", "starts", "starts"]);
    expect(list("2026-11-10")).toEqual([]);
  });

  test("friendly empty: nothing dated ahead", () => {
    expect(list("2027-06-01")).toEqual([]);
  });

  test("marks programs that aren't counted yet", () => {
    const dates = keyDates({ rows: ROWS, today: "2026-10-07", programNames, reviewStatus: new Map(), countryName });
    expect(dates.every((d) => !d.counted)).toBe(true);
  });
});

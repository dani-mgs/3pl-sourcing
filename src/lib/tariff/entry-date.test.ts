import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { todayUtc } from "@/lib/fx/server-rates";
import {
  addDaysUtc,
  checkEntryDate,
  defaultEntryDate,
  entryDateBounds,
  entryDateCaveats,
  parseEntryDate,
} from "./entry-date";

// Dates are UTC calendar dates. These run in whatever TZ the process has;
// CI and the release check run them under UTC, Asia/Manila (+8) and
// America/Los_Angeles (-7/-8) as well (TZ=... npx vitest run).

const TODAY = "2026-10-07";

describe("entryDateBounds", () => {
  test("yesterday through 366 days out", () => {
    expect(entryDateBounds(TODAY)).toEqual({ min: "2026-10-06", max: "2027-10-08" });
  });

  test("across month, year and leap-day boundaries", () => {
    expect(entryDateBounds("2026-01-01")).toEqual({ min: "2025-12-31", max: "2027-01-02" });
    expect(entryDateBounds("2027-03-01")).toEqual({ min: "2027-02-28", max: "2028-03-01" });
    // 2028 is a leap year, so a year from 2027-03-01 is 366 days.
    expect(addDaysUtc("2027-03-01", 366)).toBe("2028-03-01");
    expect(addDaysUtc("2028-02-28", 1)).toBe("2028-02-29");
  });

  test("daylight-saving changes don't move a day", () => {
    // US spring forward 2027-03-14, fall back 2026-11-01.
    expect(addDaysUtc("2026-10-31", 2)).toBe("2026-11-02");
    expect(addDaysUtc("2027-03-13", 2)).toBe("2027-03-15");
    expect(addDaysUtc("2026-10-07", 30)).toBe("2026-11-06");
  });
});

describe("checkEntryDate", () => {
  test.each([
    ["2026-10-06", true],
    ["2026-10-07", true],
    ["2026-11-08", true],
    ["2027-10-08", true],
    ["2026-10-05", false],
    ["2027-10-09", false],
  ])("%s -> %s", (value, ok) => {
    expect(checkEntryDate(value, TODAY).ok).toBe(ok);
  });

  test("a date before yesterday says plainly that past dates aren't supported", () => {
    const result = checkEntryDate("2026-10-05", TODAY);
    expect(!result.ok && result.error).toMatch(/can't be earlier than Oct 6, 2026 \(yesterday, UTC\)/);
    expect(!result.ok && result.error).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(!result.ok && result.error).toMatch(/Past entry dates aren't supported/);
    expect(!result.ok && result.error).toMatch(/current|today/);
  });

  test("a date more than 366 days out names the limit", () => {
    const result = checkEntryDate("2027-10-09", TODAY);
    expect(!result.ok && result.error).toMatch(/can't be later than Oct 8, 2027/);
    expect(!result.ok && result.error).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  test.each(["2026-02-30", "2026-13-01", "2026-10-7", "10/07/2026", "2026-10-07T00:00:00Z", "tomorrow", "0000-00-00"])(
    "%s isn't a real date",
    (value) => {
      const result = checkEntryDate(value, TODAY);
      expect(!result.ok && result.error).toMatch(/real date/);
    },
  );
});

describe("parseEntryDate", () => {
  test("blank or missing means today (an older open page that doesn't send it)", () => {
    expect(parseEntryDate("", TODAY)).toEqual({ ok: true, date: TODAY });
    expect(parseEntryDate("  ", TODAY)).toEqual({ ok: true, date: TODAY });
  });

  test("trims and accepts a date in range", () => {
    expect(parseEntryDate(" 2026-11-08 ", TODAY)).toEqual({ ok: true, date: "2026-11-08" });
  });

  test("refuses a date out of range or not real", () => {
    expect(parseEntryDate("2026-02-30", TODAY).ok).toBe(false);
    expect(parseEntryDate("2025-01-01", TODAY).ok).toBe(false);
  });
});

describe("defaultEntryDate", () => {
  test("a range: today plus the longest number", () => {
    expect(defaultEntryDate(TODAY, 28, 32)).toEqual({ date: "2026-11-08", from: "quote_lead_time", days: 32 });
  });

  test("a range given backwards still uses the longest", () => {
    expect(defaultEntryDate(TODAY, 32, 28).days).toBe(32);
  });

  test("a single number, in either column", () => {
    expect(defaultEntryDate(TODAY, null, 30)).toMatchObject({ date: "2026-11-06", from: "quote_lead_time" });
    expect(defaultEntryDate(TODAY, 30, null)).toMatchObject({ date: "2026-11-06", from: "quote_lead_time" });
  });

  test("fractions round up", () => {
    expect(defaultEntryDate(TODAY, 4.5, 4.5).days).toBe(5);
    expect(defaultEntryDate(TODAY, null, 28.1).days).toBe(29);
  });

  test.each([
    [null, null],
    [undefined, undefined],
    [0, 0],
    [-5, -1],
    [Number.NaN, Number.NaN],
    [Number.POSITIVE_INFINITY, null],
  ])("unusable lead time %s / %s falls back to today", (min, max) => {
    expect(defaultEntryDate(TODAY, min, max)).toEqual({ date: TODAY, from: "today", days: null });
  });

  test("an unusable minimum doesn't hide a usable maximum", () => {
    expect(defaultEntryDate(TODAY, 0, 20)).toMatchObject({ date: "2026-10-27", days: 20 });
  });

  test("366 days is the longest allowed; 367 falls back to today", () => {
    expect(defaultEntryDate(TODAY, null, 366).date).toBe("2027-10-08");
    expect(defaultEntryDate(TODAY, null, 367)).toMatchObject({ date: TODAY, from: "today" });
  });

  test("the default is always inside the bounds", () => {
    for (const days of [1, 7, 32, 90, 366]) {
      expect(checkEntryDate(defaultEntryDate(TODAY, null, days).date, TODAY).ok).toBe(true);
    }
  });

  test("no quote (no lead time) is today", () => {
    expect(defaultEntryDate(TODAY, undefined, undefined).date).toBe(TODAY);
  });
});

describe("entryDateCaveats", () => {
  const base = { calculatedOn: TODAY, releaseLabel: "2026 Rev. 20" };

  test("none when the entry date is today or yesterday", () => {
    expect(entryDateCaveats({ ...base, entryDate: TODAY })).toEqual([]);
    expect(entryDateCaveats({ ...base, entryDate: "2026-10-06" })).toEqual([]);
  });

  test("a later date names the HTS revision in force today and that later changes aren't included", () => {
    const caveats = entryDateCaveats({ ...base, entryDate: "2026-11-08" });
    expect(caveats[0]).toBe(
      "Base duty rate is from the HTS schedule in force today (2026 Rev. 20); changes announced later are not included.",
    );
    expect(caveats[1]).toMatch(/Additional duties and fees are those known today/);
    expect(caveats).toHaveLength(2);
  });

  test("an entry date in the next fiscal year (from 1 October) adds the fee caveat", () => {
    expect(entryDateCaveats({ ...base, entryDate: "2027-09-30" })).toHaveLength(2);
    const caveats = entryDateCaveats({ ...base, entryDate: "2027-10-01" });
    expect(caveats).toHaveLength(3);
    expect(caveats[2]).toMatch(/re-set each 1 October/);
    // Calculated in September: October 1 of the same year is already next FY.
    expect(entryDateCaveats({ ...base, calculatedOn: "2026-09-30", entryDate: "2026-10-01" })).toHaveLength(3);
  });
});

// "Today" is the UTC date whatever the machine's zone, including around UTC midnight.
describe("todayUtc and the bounds around UTC midnight", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  test.each([
    ["2026-10-07T23:59:59Z", "2026-10-07", "2026-10-06"],
    ["2026-10-08T00:00:00Z", "2026-10-08", "2026-10-07"],
    ["2026-10-08T00:00:01Z", "2026-10-08", "2026-10-07"],
    ["2026-10-07T07:59:59Z", "2026-10-07", "2026-10-06"],
    ["2026-10-07T08:00:00Z", "2026-10-07", "2026-10-06"],
  ])("at %s today is %s and the earliest entry date %s", (instant, today, earliest) => {
    vi.setSystemTime(new Date(instant));
    expect(todayUtc()).toBe(today);
    expect(entryDateBounds(todayUtc()).min).toBe(earliest);
    expect(checkEntryDate(earliest, todayUtc()).ok).toBe(true);
    expect(checkEntryDate(addDaysUtc(earliest, -1), todayUtc()).ok).toBe(false);
    expect(defaultEntryDate(todayUtc(), 28, 32).date).toBe(addDaysUtc(today, 32));
  });

  test("a user west of UTC picking their own 'today' (still yesterday in UTC) is accepted", () => {
    // 2026-10-08T03:00Z is still Oct 7 evening in Los Angeles; Oct 7 is "yesterday" in UTC.
    vi.setSystemTime(new Date("2026-10-08T03:00:00Z"));
    expect(checkEntryDate("2026-10-07", todayUtc()).ok).toBe(true);
  });
});

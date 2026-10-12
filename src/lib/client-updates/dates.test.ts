import { describe, expect, test } from "vitest";
import { daysBetween, formatDateOnly, isIsoDate, utcDateOf, utcToday } from "./dates";

// Runs in every CI timezone (7 in the QA pass): date-only values must not
// shift with the machine's zone.

describe("client update dates", () => {
  test("real dates only", () => {
    expect(isIsoDate("2026-10-17")).toBe(true);
    expect(isIsoDate("2028-02-29")).toBe(true);
    expect(isIsoDate("2026-02-29")).toBe(false);
    expect(isIsoDate("2026-13-01")).toBe(false);
    expect(isIsoDate("2026-1-01")).toBe(false);
    expect(isIsoDate("17/10/2026")).toBe(false);
  });

  test("formatting doesn't depend on the local timezone", () => {
    expect(formatDateOnly("2026-10-01")).toBe("Oct 1");
    expect(formatDateOnly("2026-12-31", "2026-10-12")).toBe("Dec 31");
    expect(formatDateOnly("2027-01-01", "2026-10-12")).toBe("Jan 1, 2027");
  });

  test("whole days between dates, across DST changes", () => {
    expect(daysBetween("2026-10-12", "2026-10-31")).toBe(19);
    expect(daysBetween("2026-10-31", "2026-10-12")).toBe(-19);
    expect(daysBetween("2026-03-07", "2026-03-09")).toBe(2);
    expect(daysBetween("2026-10-24", "2026-10-26")).toBe(2);
  });

  test("today and timestamps use UTC", () => {
    expect(utcToday(new Date("2026-10-12T23:30:00-07:00"))).toBe("2026-10-13");
    expect(utcToday(new Date("2026-10-13T07:59:00+08:00"))).toBe("2026-10-12");
    expect(utcDateOf("2026-10-09T18:00:00-07:00")).toBe("2026-10-10");
  });
});

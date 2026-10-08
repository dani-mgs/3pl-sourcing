import { describe, expect, test } from "vitest";
import { pickDate } from "./quote-extraction";

describe("pickDate", () => {
  test("passes through a valid YYYY-MM-DD date", () => {
    expect(pickDate("2026-09-29")).toBe("2026-09-29");
  });

  test("rejects a non-ISO date format rather than saving unparseable text", () => {
    expect(pickDate("09/29/2026")).toBeNull();
    expect(pickDate("September 29, 2026")).toBeNull();
  });

  test("returns null when the input is undefined (field omitted)", () => {
    expect(pickDate(undefined)).toBeNull();
  });
});

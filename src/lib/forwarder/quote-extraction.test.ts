import { describe, expect, test } from "vitest";
import { canonicalizeScenarioGroup, pickDate } from "./quote-extraction";

describe("canonicalizeScenarioGroup", () => {
  const existing = ["Ho Chi Minh City to Tacoma (FCL)", "Phnom Penh to Tacoma"];

  test("returns the canonical existing string on a case-insensitive match", () => {
    expect(
      canonicalizeScenarioGroup("ho chi minh city to tacoma (fcl)", existing),
    ).toBe("Ho Chi Minh City to Tacoma (FCL)");
  });

  test("returns the canonical existing string ignoring extra whitespace", () => {
    expect(
      canonicalizeScenarioGroup("  Ho Chi Minh City to Tacoma (FCL)  ", existing),
    ).toBe("Ho Chi Minh City to Tacoma (FCL)");
  });

  test("keeps new text (trimmed) when nothing matches", () => {
    expect(canonicalizeScenarioGroup("  A brand new lane  ", existing)).toBe(
      "A brand new lane",
    );
  });

  test("returns undefined for an empty or whitespace-only value", () => {
    expect(canonicalizeScenarioGroup("", existing)).toBeUndefined();
    expect(canonicalizeScenarioGroup("   ", existing)).toBeUndefined();
  });

  test("returns undefined when the input is undefined (field omitted)", () => {
    expect(canonicalizeScenarioGroup(undefined, existing)).toBeUndefined();
  });

  test("works with an empty existing-groups list", () => {
    expect(canonicalizeScenarioGroup("New Lane", [])).toBe("New Lane");
  });

  test("filters the model's own placeholder text rather than treating it as a real scenario name", () => {
    expect(canonicalizeScenarioGroup("<UNKNOWN>", existing)).toBeUndefined();
    expect(canonicalizeScenarioGroup("unknown", existing)).toBeUndefined();
    expect(canonicalizeScenarioGroup("N/A", existing)).toBeUndefined();
  });
});

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

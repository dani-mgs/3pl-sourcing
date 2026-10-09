import { describe, expect, test } from "vitest";
import { PROJECT_FIELDS_SELECT, parseProjectForm, parseSummaryNotesForm } from "./parse-project-form";

function formData(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(overrides)) {
    fd.set(key, value);
  }
  return fd;
}

describe("parseProjectForm", () => {
  test("accepts valid input", () => {
    const result = parseProjectForm(
      formData({ avg_monthly_orders: "500", target_geography: "North America" }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.avg_monthly_orders).toBe(500);
      expect(result.data.target_geography).toBe("North America");
    }
  });

  test("accepts an entirely blank form (every field optional)", () => {
    const result = parseProjectForm(formData());
    expect(result.ok).toBe(true);
  });

  test("rejects a negative order count", () => {
    const result = parseProjectForm(formData({ avg_monthly_orders: "-10" }));
    expect(result.ok).toBe(false);
  });

  test("rejects a too-long free-text field", () => {
    const result = parseProjectForm(
      formData({ core_cost_categories: "x".repeat(2001) }),
    );
    expect(result.ok).toBe(false);
  });

  test("rejects a non-integer order count", () => {
    const result = parseProjectForm(formData({ peak_monthly_units: "12.5" }));
    expect(result.ok).toBe(false);
  });
});

describe("parseSummaryNotesForm", () => {
  test("accepts valid notes", () => {
    const result = parseSummaryNotesForm(formData({ summary_notes: "Looks good." }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.summary_notes).toBe("Looks good.");
    }
  });

  test("accepts blank notes as null", () => {
    const result = parseSummaryNotesForm(formData());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.summary_notes).toBeNull();
    }
  });

  test("rejects notes over the length cap, saying why (B-12)", () => {
    const result = parseSummaryNotesForm(
      formData({ summary_notes: "x".repeat(10005) }),
    );
    expect(result).toEqual({
      ok: false,
      error: "Notes can be up to 10,000 characters (this has 10,005).",
    });
  });

  test("exactly 10,000 characters is fine, and surrounding spaces don't count", () => {
    expect(parseSummaryNotesForm(formData({ summary_notes: "x".repeat(10000) })).ok).toBe(true);
    expect(parseSummaryNotesForm(formData({ summary_notes: `  ${"x".repeat(10000)}  ` })).ok).toBe(true);
  });
});

describe("parseProjectForm: contract period", () => {
  const parse = (value?: string) =>
    parseProjectForm(formData(value === undefined ? {} : { contract_period_months: value }));

  test.each([
    ["1", 1],
    ["36", 36],
    ["120", 120],
    [" 24 ", 24],
  ])("accepts %j", (input, expected) => {
    const result = parse(input);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.contract_period_months).toBe(expected);
  });

  test.each([undefined, "", "   "])("blank %j is saved as empty", (input) => {
    const result = parse(input);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.contract_period_months).toBeNull();
  });

  test.each(["0", "121", "-3", "1.5", "1e2", "0x10", "twelve", "36 months"])(
    "refuses %j with a plain-language message",
    (input) => {
      const result = parse(input);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe(
          "Contract period must be a whole number of months from 1 to 120, or left empty.",
        );
      }
    },
  );

  test("is part of the saved/selected columns", () => {
    expect(PROJECT_FIELDS_SELECT).toContain("contract_period_months");
  });
});

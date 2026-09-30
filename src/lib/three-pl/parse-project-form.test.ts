import { describe, expect, test } from "vitest";
import { parseProjectForm, parseSummaryNotesForm } from "./parse-project-form";

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

  test("rejects notes over the length cap", () => {
    const result = parseSummaryNotesForm(
      formData({ summary_notes: "x".repeat(10001) }),
    );
    expect(result.ok).toBe(false);
  });
});

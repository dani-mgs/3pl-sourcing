import { describe, expect, test } from "vitest";
import { parseRecommendationForm } from "./parse-recommendation-form";

function formData(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(overrides)) {
    fd.set(key, value);
  }
  return fd;
}

const VALID_UUID = "123e4567-e89b-12d3-a456-426614174000";

describe("parseRecommendationForm", () => {
  test("accepts valid input", () => {
    const result = parseRecommendationForm(
      formData({ priority: "Cost Savings", provider_id_1: VALID_UUID }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.priority).toBe("Cost Savings");
      expect(result.data.provider_id_1).toBe(VALID_UUID);
      expect(result.data.provider_id_2).toBeNull();
    }
  });

  test("rejects a missing priority", () => {
    const result = parseRecommendationForm(formData());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("Priority is required.");
    }
  });

  test("rejects an invalid priority value", () => {
    const result = parseRecommendationForm(
      formData({ priority: "Fastest Shipping" }),
    );
    expect(result.ok).toBe(false);
  });

  test("rejects a malformed provider id", () => {
    const result = parseRecommendationForm(
      formData({ priority: "Turnaround Time", provider_id_2: "not-a-uuid" }),
    );
    expect(result.ok).toBe(false);
  });
});

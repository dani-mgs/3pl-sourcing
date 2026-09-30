import { describe, expect, test } from "vitest";
import { parseProviderForm } from "./parse-provider-form";

function baseFormData(overrides: Record<string, string> = {}): FormData {
  const formData = new FormData();
  formData.set("company_name", "Acme Logistics");
  formData.set("status", "Potential / Not Contacted");
  formData.set("currency", "USD");
  for (const [key, value] of Object.entries(overrides)) {
    formData.set(key, value);
  }
  return formData;
}

describe("parseProviderForm", () => {
  test("accepts valid input", () => {
    const result = parseProviderForm(
      baseFormData({ storage_cost: "1200.50", onboarding_period_months: "3" }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.company_name).toBe("Acme Logistics");
      expect(result.data.storage_cost).toBe(1200.5);
      expect(result.data.onboarding_period_months).toBe(3);
    }
  });

  test("rejects a negative cost", () => {
    const result = parseProviderForm(baseFormData({ storage_cost: "-50" }));
    expect(result.ok).toBe(false);
  });

  test("rejects a cost exceeding numeric(12,2)'s range", () => {
    const result = parseProviderForm(baseFormData({ pick_pack_cost: "10000000000" }));
    expect(result.ok).toBe(false);
  });

  test("accepts a cost at the exact numeric(12,2) boundary", () => {
    const result = parseProviderForm(
      baseFormData({ receiving_cost: "9999999999.99" }),
    );
    expect(result.ok).toBe(true);
  });

  test("rejects a too-long free-text field", () => {
    const result = parseProviderForm(
      baseFormData({ location: "x".repeat(501) }),
    );
    expect(result.ok).toBe(false);
  });

  test("rejects a missing required company_name", () => {
    const formData = baseFormData();
    formData.set("company_name", "");
    const result = parseProviderForm(formData);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("Company name is required.");
    }
  });

  test("rejects a negative rate_details value", () => {
    const result = parseProviderForm(baseFormData({ storage_rate: "-1" }));
    expect(result.ok).toBe(false);
  });

  test("normalizes a bare website into https://", () => {
    const result = parseProviderForm(
      baseFormData({ website: "acmelogistics.com" }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.website).toBe("https://acmelogistics.com");
    }
  });

  test("rejects an invalid status", () => {
    const formData = baseFormData({ status: "Not A Real Status" });
    const result = parseProviderForm(formData);
    expect(result.ok).toBe(false);
  });

  test("coerces capability checkboxes correctly", () => {
    const result = parseProviderForm(baseFormData({ receiving: "true", storage: "false" }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.receiving).toBe(true);
      expect(result.data.storage).toBe(false);
    }
  });
});

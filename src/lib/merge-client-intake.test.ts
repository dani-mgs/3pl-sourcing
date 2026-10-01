import { describe, expect, test } from "vitest";
import { mergeClientIntakeFields } from "./merge-client-intake";
import { describeMergeRules } from "@/lib/test-support/merge-checks";
import type { ClientIntakeFields } from "@/components/client-intake-form";

const current: ClientIntakeFields = {
  target_geography: "US",
  avg_monthly_orders: 1000,
  peak_monthly_orders: 2000,
  latest_month_orders: 1100,
  avg_monthly_units: 3000,
  peak_monthly_units: 6000,
  benchmark_period: "2025",
  core_cost_categories: "Storage; Pick & Pack",
  key_capability_needs: "Receiving",
  main_decision_focus: "Cost",
  tech_integration_requirement: "Shopify",
  special_handling_requirement: "None",
  fixed_comparison_principle: "Same volumes",
  important_limitation: "Peak season",
  assumptions_data_limitations: "Estimates",
};

describeMergeRules("mergeClientIntakeFields", mergeClientIntakeFields, current, {
  // The client's name and business model live on the shared, admin-only
  // clients record: an upload can never put them on the project.
  protectedKeys: ["client_name", "business_model"],
  textKeys: [
    "target_geography",
    "benchmark_period",
    "main_decision_focus",
    "tech_integration_requirement",
    "special_handling_requirement",
    "fixed_comparison_principle",
    "important_limitation",
    "assumptions_data_limitations",
  ],
});

describe("mergeClientIntakeFields: tag lists are combined, never replaced", () => {
  test("new tags are added after the existing ones and marked Updated", () => {
    const { merged, changed } = mergeClientIntakeFields(current, {
      ...current,
      core_cost_categories: "Returns; Storage",
    });
    expect(merged.core_cost_categories).toBe("Storage; Pick & Pack; Returns");
    expect([...changed]).toEqual(["core_cost_categories"]);
  });

  test("a document listing fewer tags never removes any", () => {
    const { merged, changed } = mergeClientIntakeFields(current, {
      ...current,
      core_cost_categories: "Storage",
    });
    expect(merged.core_cost_categories).toBe("Storage; Pick & Pack");
    expect([...changed]).toEqual([]);
  });

  test("tags are added to an empty list", () => {
    const { merged, changed } = mergeClientIntakeFields(
      { ...current, key_capability_needs: null },
      { ...current, key_capability_needs: "Storage; Dispatch" },
    );
    expect(merged.key_capability_needs).toBe("Storage; Dispatch");
    expect([...changed]).toEqual(["key_capability_needs"]);
  });
});

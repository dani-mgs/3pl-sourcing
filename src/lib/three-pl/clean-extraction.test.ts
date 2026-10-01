import { describe, expect, test } from "vitest";
import {
  cleanProviderExtraction,
  toClientIntakeFields,
  toExistingProvider,
} from "./clean-extraction";
import { mergeProviderFields } from "@/lib/merge-provider-fields";
import { mergeClientIntakeFields } from "@/lib/merge-client-intake";
import type { ProviderFormDefaults } from "@/components/provider-form";
import type { ClientIntakeFields } from "@/components/client-intake-form";

const PLACEHOLDERS = ["N/A", "Unknown", "<UNKNOWN>", "not specified", "", "   "];

describe("cleanProviderExtraction", () => {
  test.each(PLACEHOLDERS)("placeholder %j is dropped from every text field", (filler) => {
    const cleaned = cleanProviderExtraction({
      company_name: filler,
      contact_person: filler,
      email: filler,
      phone: filler,
      billing_terms: filler,
    });
    expect(cleaned).toEqual({});
  });

  test("real values are kept (text trimmed); only true capabilities survive", () => {
    expect(
      cleanProviderExtraction({
        contact_person: "  Sam Lee ",
        storage_cost: 1200,
        receiving: true,
        storage: false,
      }),
    ).toEqual({ contact_person: "Sam Lee", storage_cost: 1200, receiving: true });
  });

  test("keys outside the tool's schema are dropped (no status, assessment, incumbent)", () => {
    const cleaned = cleanProviderExtraction({
      email: "sam@acme.example",
      status: "Vetted",
      assessment_status: "Strong",
      is_incumbent: true,
    } as never);
    expect(cleaned).toEqual({ email: "sam@acme.example" });
  });

  test("a non-numeric cost is dropped", () => {
    expect(cleanProviderExtraction({ storage_cost: "1200" as never, pick_pack_cost: NaN })).toEqual({});
  });

  test("end to end: filler never overwrites or blanks an existing 3PL value", () => {
    const current = {
      contact_person: "Sam Lee",
      email: "sam@acme.example",
      billing_terms: "Net 30",
    } as ProviderFormDefaults;
    const { merged, changed } = mergeProviderFields(
      current,
      cleanProviderExtraction({ contact_person: "N/A", email: "", billing_terms: "Not specified" }),
    );
    expect(merged).toMatchObject(current);
    expect([...changed]).toEqual([]);
  });
});

describe("toClientIntakeFields", () => {
  test.each(PLACEHOLDERS)("placeholder %j becomes null", (filler) => {
    const fields = toClientIntakeFields({ target_geography: filler, main_decision_focus: filler });
    expect(fields.target_geography).toBeNull();
    expect(fields.main_decision_focus).toBeNull();
  });

  test("tag lists keep only preset values", () => {
    const fields = toClientIntakeFields({
      core_cost_categories: ["Storage", "Made Up", "Returns"],
      key_capability_needs: ["Not a capability"],
    });
    expect(fields.core_cost_categories).toBe("Storage; Returns");
    expect(fields.key_capability_needs).toBeNull();
  });

  test("end to end: filler never overwrites an existing intake value", () => {
    const current = { target_geography: "US", important_limitation: "Peak" } as ClientIntakeFields;
    const { merged, changed } = mergeClientIntakeFields(
      current,
      toClientIntakeFields({ target_geography: "Unknown", important_limitation: "N/A" }),
    );
    expect(merged).toMatchObject(current);
    expect([...changed]).toEqual([]);
  });
});

describe("toExistingProvider", () => {
  test("no provider when its name is missing or filler", () => {
    expect(toExistingProvider({})).toBeUndefined();
    expect(toExistingProvider({ existing_provider: { company_name: "N/A", storage_cost: 5 } })).toBeUndefined();
  });

  test("a named provider keeps its costs; a filler location becomes null", () => {
    expect(
      toExistingProvider({
        existing_provider: { company_name: " Old 3PL ", location: "Unknown", storage_cost: 900 },
      }),
    ).toEqual({
      company_name: "Old 3PL",
      location: null,
      storage_cost: 900,
      pick_pack_cost: null,
      receiving_cost: null,
      returns_cost: null,
    });
  });
});

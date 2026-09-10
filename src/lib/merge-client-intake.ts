import { CHIP_SEPARATOR, parseChipValue } from "./chip-value";
import { mergeScalarField } from "./merge-fields";
import type { ClientIntakeFields } from "@/components/client-intake-form";

type ChipField = "core_cost_categories" | "key_capability_needs";

export type MergeResult = {
  merged: ClientIntakeFields;
  changed: Set<string>;
};

function mergeChips(
  current: ClientIntakeFields,
  extracted: ClientIntakeFields,
  key: ChipField,
  merged: ClientIntakeFields,
  changed: Set<string>,
) {
  const extractedValue = extracted[key];
  if (!extractedValue) return;

  const currentTokens = parseChipValue(current[key]);
  const newTokens = parseChipValue(extractedValue);
  const union = [...currentTokens];
  let addedAny = false;
  for (const token of newTokens) {
    if (!union.includes(token)) {
      union.push(token);
      addedAny = true;
    }
  }
  if (addedAny) {
    merged[key] = union.join(CHIP_SEPARATOR);
    changed.add(key);
  }
}

// Update-from-document merge: only overwrites a field when the document clearly
// stated a new value for it — anything not mentioned keeps the client's existing
// value. The two chip fields are unioned (adding newly-mentioned selections)
// rather than replaced, since removal should stay a deliberate manual action.
// client_name is deliberately excluded: it's the record's identity rather than a
// mergeable detail, and any casual mention of the client's name in a document
// (e.g. a shortened form) would otherwise silently overwrite the real one —
// renaming a client should stay an explicit manual edit.
export function mergeClientIntakeFields(
  current: ClientIntakeFields,
  extracted: ClientIntakeFields,
): MergeResult {
  const merged: ClientIntakeFields = { ...current };
  const changed = new Set<string>();

  mergeScalarField(current, extracted, "business_model", merged, changed);
  mergeScalarField(current, extracted, "target_geography", merged, changed);
  mergeScalarField(current, extracted, "avg_monthly_orders", merged, changed);
  mergeScalarField(current, extracted, "peak_monthly_orders", merged, changed);
  mergeScalarField(current, extracted, "latest_month_orders", merged, changed);
  mergeScalarField(current, extracted, "avg_monthly_units", merged, changed);
  mergeScalarField(current, extracted, "peak_monthly_units", merged, changed);
  mergeScalarField(current, extracted, "benchmark_period", merged, changed);
  mergeChips(current, extracted, "core_cost_categories", merged, changed);
  mergeChips(current, extracted, "key_capability_needs", merged, changed);
  mergeScalarField(current, extracted, "main_decision_focus", merged, changed);
  mergeScalarField(
    current,
    extracted,
    "tech_integration_requirement",
    merged,
    changed,
  );
  mergeScalarField(
    current,
    extracted,
    "special_handling_requirement",
    merged,
    changed,
  );
  mergeScalarField(
    current,
    extracted,
    "fixed_comparison_principle",
    merged,
    changed,
  );
  mergeScalarField(current, extracted, "important_limitation", merged, changed);
  mergeScalarField(
    current,
    extracted,
    "assumptions_data_limitations",
    merged,
    changed,
  );

  return { merged, changed };
}

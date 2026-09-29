import { mergeScalarField } from "@/lib/merge-fields";
import { INCOTERMS, isTypeAllowedForMode } from "./project-fields";
import type { ForwarderProjectDefaults } from "@/app/(authenticated)/forwarder-sourcing/forwarder-project-form";

// Everything the extraction tool can populate. status is deliberately absent
// — that's internal tracking judgment a user sets manually, never a fact
// pulled from a document (mirrors 3PL excluding status/assessment_status).
export type ExtractedForwarderProjectFields = Omit<
  ForwarderProjectDefaults,
  "status"
>;

const SCALAR_FIELDS = [
  "origin_country",
  "origin_city",
  "origin_port",
  "destination_country",
  "destination_city",
  "destination_port",
  "final_delivery_address",
  "cargo_description",
  "packaging_type",
  "units",
  "cartons",
  "pallets",
  "weight_kg",
  "cbm",
  "stackable",
  "dangerous_goods",
  "temperature_controlled",
  "special_handling",
  "packing_list_available",
  "packing_list_reference",
  "packing_list_notes",
  "current_incoterm",
  "current_freight_cost_usd",
  "current_freight_forwarder",
  "current_lead_time_days",
  "shipments_per_month",
  "shipments_per_year",
  "final_incoterm",
  "target_lead_time_days",
  "hs_code",
  "invoice_value",
  "invoice_currency",
  "insurance_required",
  "brokerage_needed",
] as const satisfies readonly (keyof ExtractedForwarderProjectFields)[];

// Every field the extraction tool can populate, for building merge-mode's
// "current values" prompt context. mode/type/incoterms_to_compare are added
// separately since they're merged with their own logic below, not via a
// straight loop over mergeScalarField.
export const EXTRACTABLE_FIELD_KEYS: (keyof ExtractedForwarderProjectFields)[] =
  [
    ...SCALAR_FIELDS,
    "shipment_mode",
    "shipment_type",
    "final_shipment_mode",
    "final_shipment_type",
    "incoterms_to_compare",
  ];

export type ForwarderProjectMergeResult = {
  merged: ForwarderProjectDefaults;
  changed: Set<string>;
};

// Update-from-document merge for a forwarder project: only overwrites a field
// when the document clearly stated a new value for it — anything not
// mentioned keeps the project's existing value. The two mode/type pairs are
// merged individually and then re-validated together: if a merged pair no
// longer fits (e.g. the document states a new mode but the current type
// doesn't go with it), the mode is kept and the type is cleared — flagged as
// changed so the user notices and re-picks it — rather than the whole
// extraction being rejected or the pairing silently "corrected."
export function mergeForwarderProjectFields(
  current: ForwarderProjectDefaults,
  extracted: ExtractedForwarderProjectFields,
): ForwarderProjectMergeResult {
  const merged: ForwarderProjectDefaults = { ...current };
  const changed = new Set<string>();

  for (const key of SCALAR_FIELDS) {
    mergeScalarField(current, extracted, key, merged, changed);
  }

  mergeModePair(
    current,
    extracted,
    merged,
    changed,
    "shipment_mode",
    "shipment_type",
  );
  mergeModePair(
    current,
    extracted,
    merged,
    changed,
    "final_shipment_mode",
    "final_shipment_type",
  );

  if (extracted.incoterms_to_compare && extracted.incoterms_to_compare.length > 0) {
    const next = INCOTERMS.filter((term) =>
      extracted.incoterms_to_compare!.includes(term),
    );
    const currentSet = new Set(current.incoterms_to_compare ?? []);
    const isDifferent =
      next.length !== currentSet.size || next.some((term) => !currentSet.has(term));
    if (isDifferent) {
      merged.incoterms_to_compare = next;
      changed.add("incoterms_to_compare");
    }
  }

  return { merged, changed };
}

function mergeModePair(
  current: ForwarderProjectDefaults,
  extracted: ExtractedForwarderProjectFields,
  merged: ForwarderProjectDefaults,
  changed: Set<string>,
  modeKey: "shipment_mode" | "final_shipment_mode",
  typeKey: "shipment_type" | "final_shipment_type",
) {
  mergeScalarField(current, extracted, modeKey, merged, changed);
  mergeScalarField(current, extracted, typeKey, merged, changed);

  if (
    merged[typeKey] != null &&
    !isTypeAllowedForMode(merged[modeKey] ?? null, merged[typeKey] ?? null)
  ) {
    merged[typeKey] = null;
    changed.add(typeKey);
  }
}

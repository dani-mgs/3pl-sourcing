import { mergeScalarField } from "@/lib/merge-fields";
import { CAPABILITY_FIELDS } from "./forwarder-fields";
import type { ForwarderFormDefaults } from "@/app/(authenticated)/forwarder-sourcing/[id]/forwarders/forwarder-form";

// Everything the extraction tool can populate. status, assessment, next_action,
// and key_notes are deliberately absent — where a forwarder sits in MOVE's own
// sourcing pipeline, and personal follow-up notes, are the user's internal
// tracking judgment, never a fact a capability statement or coverage document
// from/about the forwarder would state (mirrors 3PL excluding
// status/assessment_status/is_incumbent from provider extraction).
export type ExtractedForwarderFields = Omit<
  ForwarderFormDefaults,
  "status" | "assessment" | "next_action" | "key_notes"
>;

const TEXT_FIELDS = [
  "website",
  "headquarters",
  "footprint",
  "contact_person",
  "contact_position",
  "email",
  "phone",
  "origin_coverage",
  "destination_coverage",
  "other_services",
] as const satisfies readonly (keyof ExtractedForwarderFields)[];

const CAPABILITY_KEYS = CAPABILITY_FIELDS.map((c) => c.name);

// Every field the extraction tool can populate, for building merge-mode's
// "current values" prompt context.
export const EXTRACTABLE_FIELD_KEYS: (keyof ExtractedForwarderFields)[] = [
  ...TEXT_FIELDS,
  ...CAPABILITY_KEYS,
];

export type ForwarderMergeResult = {
  merged: ForwarderFormDefaults;
  changed: Set<string>;
};

// Update-from-document merge for an existing forwarder: only overwrites a
// field when the document clearly stated a new value for it — anything not
// mentioned keeps the forwarder's existing value. Unlike 3PL's provider
// capability merge (which only ever flips false -> true, since that schema
// never asserts a capability is absent), forwarder capabilities are merged
// symmetrically via mergeScalarField like any other field: the extraction
// tool itself is responsible for only asserting true/false when the document
// explicitly confirms or denies a capability, never for silence. A stated
// true->false or false->true change is flagged as "changed" — never
// auto-applied, same as every other field; the user still reviews and saves.
// company_name is excluded from the merge for the same identity reason 3PL
// never merges a provider's company_name (it still pre-fills on a blank
// create, since there's no existing name to protect there).
export function mergeForwarderFields(
  current: ForwarderFormDefaults,
  extracted: ExtractedForwarderFields,
): ForwarderMergeResult {
  const merged: ForwarderFormDefaults = { ...current };
  const changed = new Set<string>();

  for (const key of TEXT_FIELDS) {
    mergeScalarField(current, extracted, key, merged, changed);
  }
  for (const key of CAPABILITY_KEYS) {
    mergeScalarField(current, extracted, key, merged, changed);
  }

  return { merged, changed };
}

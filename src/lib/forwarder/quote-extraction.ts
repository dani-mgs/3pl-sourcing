import { cleanExtractedText } from "../document-extraction";

// Pure helpers for forwarder-quote AI extraction, split out from
// extract-actions.ts (a "use server" file, which can only export Server
// Actions) so this deterministic logic is directly unit-testable.

// Case-insensitive, whitespace-trimmed match against the project's existing
// scenario groups — the canonical existing string always wins over the
// model's own text, since cost-comparison.ts groups quotes by exact string
// equality and a near-miss (casing, trailing space) would silently fragment
// a comparison group. Also runs the same placeholder-text filter every other
// free-text field gets (e.g. a stray "<UNKNOWN>" on a garbled document) —
// scenario_group is otherwise the one required text field with no other
// deterministic guard against a fabricated/placeholder value reaching the
// form, so this can't be skipped the way it might be for an optional field.
export function canonicalizeScenarioGroup(
  value: string | undefined,
  existingScenarioGroups: string[],
): string | undefined {
  const cleaned = cleanExtractedText(value);
  if (cleaned === undefined) return undefined;
  const match = existingScenarioGroups.find(
    (existing) => existing.trim().toLowerCase() === cleaned.toLowerCase(),
  );
  return match ?? cleaned;
}

// Matches an ISO-ish date string loosely; the form's <input type="date">
// only accepts YYYY-MM-DD, so anything else is dropped rather than saved as
// unparseable text the date picker can't display.
export function pickDate(value: string | undefined): string | null {
  if (value === undefined) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

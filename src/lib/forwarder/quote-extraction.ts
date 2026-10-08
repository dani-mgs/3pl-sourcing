// Pure helpers for forwarder-quote AI extraction, split out from
// extract-actions.ts (a "use server" file, which can only export Server
// Actions) so this deterministic logic is directly unit-testable.

// Matches an ISO-ish date string loosely; the form's <input type="date">
// only accepts YYYY-MM-DD, so anything else is dropped rather than saved as
// unparseable text the date picker can't display.
export function pickDate(value: string | undefined): string | null {
  if (value === undefined) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

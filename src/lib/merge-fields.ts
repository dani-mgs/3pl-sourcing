// Shared by every "merge extracted document data into an existing record"
// flow (client intake, 3PL): only overwrites `merged[key]` when `extracted`
// has an explicit, different value — anything the document didn't mention
// stays untouched, and every overwritten key gets recorded in `changed` so
// the UI can highlight it.
export function mergeScalarField<T extends object, K extends keyof T>(
  current: T,
  extracted: Partial<T>,
  key: K,
  merged: T,
  changed: Set<string>,
) {
  const value = extracted[key];
  if (value == null) return;
  if (value !== current[key]) {
    merged[key] = value as T[K];
    changed.add(key as string);
  }
}

// Partner letters in a Market Report. The database hands them out
// (assign_partner_labels(), under a lock) and never changes or reuses one;
// this mirrors its sequence so the preview shows the letters Publish will
// give. If another publish takes a letter in between, Publish sees a
// different payload than the preview and asks for a new preview.

// The n-th letter of a project (0-based): D..Z, then AA, AB, ... Must match
// market_report_label_at() in the migration.
export function labelAt(index: number): string {
  if (index < 23) return String.fromCharCode(68 + index);
  const k = index - 23;
  return String.fromCharCode(65 + Math.floor(k / 26)) + String.fromCharCode(65 + (k % 26));
}

export type StoredLabels = {
  // Forwarder id -> letter, for forwarders that still exist.
  byForwarder: Map<string, string>;
  // Every letter ever given in the project, including deleted forwarders'.
  used: number;
};

// The letters the next publish would give: existing ones kept, new ones in
// the order given.
export function provisionalLabels(stored: StoredLabels, order: string[]): Map<string, string> {
  const labels = new Map(stored.byForwarder);
  let next = stored.used;
  for (const id of order) {
    if (!labels.has(id)) labels.set(id, labelAt(next++));
  }
  return labels;
}

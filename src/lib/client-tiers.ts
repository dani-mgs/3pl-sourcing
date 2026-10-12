import type { ClientTier } from "@/lib/admin/parse-admin-input";

// What a client's portal users get: the free Move summary, or the paid
// Market Report (client_entitlements, admin-only writes).
export const TIER_LABELS: Record<ClientTier, string> = {
  free: "Free (Move summary)",
  market_report: "Market Report (paid)",
};

export type EntitlementRow = { client_id: string; tier: string; valid_until: string | null };

// No row, an unknown tier, or an end date that has passed: free.
export function effectiveTier(row: Pick<EntitlementRow, "tier" | "valid_until"> | null | undefined, now = Date.now()): ClientTier {
  if (!row || row.tier !== "market_report") return "free";
  if (row.valid_until && !(Date.parse(row.valid_until) > now)) return "free";
  return "market_report";
}

export function tiersByClientId(rows: EntitlementRow[] | null | undefined, now = Date.now()): Map<string, ClientTier> {
  return new Map((rows ?? []).map((row) => [row.client_id, effectiveTier(row, now)]));
}

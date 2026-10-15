import { formatRateDate, timestampDateUtc } from "@/lib/fx/rate-provenance";

// Who created and last changed a customs_fees row, and its history from
// tariff_data_history, as plain text for the Duty data → Fees page. Pure:
// rows and names are passed in. Only display names are ever shown: a user
// with none is "Staff" and a user without a profile "Unknown user", never an
// email or an id.

export type FeeAuditRow = {
  created_at: string;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
};

export type FeeHistoryRow = {
  id: number;
  row_id: string;
  operation: "INSERT" | "UPDATE" | "DELETE";
  old_row: Record<string, unknown> | null;
  new_row: Record<string, unknown> | null;
  changed_by: string | null;
  changed_at: string;
};

// User id → display name (null when the profile has none), for the users
// whose profiles could be read.
export type DisplayNames = Map<string, string | null>;

export type FeeAudit = {
  created: string;
  lastChanged: string;
  // Newest first.
  history: { id: number; text: string }[];
  // Shown when history is empty.
  emptyHistoryText: string;
};

export const STAFF_FALLBACK = "Staff";
export const UNKNOWN_USER = "Unknown user";

export function personName(userId: string, names: DisplayNames): string {
  if (!names.has(userId)) return UNKNOWN_USER;
  return names.get(userId)?.trim() || STAFF_FALLBACK;
}

const day = (timestamp: string) => formatRateDate(timestampDateUtc(timestamp));

const FIELD_LABELS: Record<string, string> = {
  fee_code: "Fee",
  label: "Label",
  rate_pct: "Rate (%)",
  min_usd: "Minimum (USD)",
  max_usd: "Maximum (USD)",
  flat_usd: "Flat fee (USD)",
  applies_up_to_value_usd: "Applies up to value (USD)",
  effective_from: "First day it applies",
  source_label: "Source",
  source_url: "Source link",
  notes: "Notes",
};

const FEE_CODES: Record<string, string> = {
  mpf_formal: "MPF (formal entry)",
  mpf_informal: "MPF (informal entry)",
  hmf: "HMF",
};

// Stamps every change carries; not a change of the fee itself.
const STAMPS = new Set(["id", "created_at", "created_by", "updated_at", "updated_by"]);

function shown(key: string, value: unknown): string {
  if (value == null || value === "") return "none";
  if (key === "fee_code" && typeof value === "string") return FEE_CODES[value] ?? value;
  if (key === "effective_from" && typeof value === "string") return formatRateDate(value);
  return String(value);
}

// "Added", "End date set to Sep 30, 2027", "Maximum (USD) 670.86 → 690".
export function summarizeFeeChange(entry: Pick<FeeHistoryRow, "operation" | "old_row" | "new_row">): string {
  if (entry.operation === "INSERT") return "Added";
  if (entry.operation === "DELETE") return "Deleted";
  const before = entry.old_row ?? {};
  const after = entry.new_row ?? {};
  const changes: string[] = [];
  for (const key of Object.keys(after)) {
    if (STAMPS.has(key) || JSON.stringify(before[key]) === JSON.stringify(after[key])) continue;
    if (key === "effective_to") {
      const from = before[key] as string | null;
      const to = after[key] as string | null;
      changes.push(
        to == null
          ? "End date removed"
          : from == null
            ? `End date set to ${formatRateDate(to)}`
            : `End date ${formatRateDate(from)} → ${formatRateDate(to)}`,
      );
      continue;
    }
    changes.push(`${FIELD_LABELS[key] ?? key.replace(/_/g, " ")} ${shown(key, before[key])} → ${shown(key, after[key])}`);
  }
  return changes.length > 0 ? changes.join("; ") : "No change to the fee";
}

export function feeAudit(row: FeeAuditRow, history: FeeHistoryRow[], names: DisplayNames): FeeAudit {
  const seeded = row.created_by == null;
  const created = seeded
    ? `Seeded ${day(row.created_at)}`
    : `Created ${day(row.created_at)} by ${personName(row.created_by!, names)}`;
  // The audit trigger stamps updated_at = created_at on insert.
  const changed = new Date(row.updated_at).getTime() !== new Date(row.created_at).getTime();
  const lastChanged = !changed
    ? "Not changed since"
    : `Last changed ${day(row.updated_at)} by ${row.updated_by ? personName(row.updated_by, names) : "a migration"}`;
  return {
    created,
    lastChanged,
    history: [...history]
      .sort((a, b) => new Date(b.changed_at).getTime() - new Date(a.changed_at).getTime() || b.id - a.id)
      .map((h) => ({
        id: h.id,
        text: `${day(h.changed_at)} · ${h.changed_by ? personName(h.changed_by, names) : "Migration"}: ${summarizeFeeChange(h)}`,
      })),
    // Seeded rows predate the history trigger, so their history starts with
    // the first change after seeding.
    emptyHistoryText: seeded ? "No changes recorded since it was seeded." : "No changes recorded.",
  };
}

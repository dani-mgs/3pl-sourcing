import type { ReviewStatus } from "@/lib/tariff/additional-duties";

// The expert checklist: a progress tracker only. Nothing here reads or writes
// duty data or reviews; the live hints below are read-only labels shown
// beside a tick and never decide it.

export const NOTE_MAX = 500;

export const GROUP_TITLES: Record<string, string> = {
  A: "Access",
  B: "Review pending programs",
  C: "Resolve data questions",
  D: "Load missing Section 232 programs",
  E: "Load scheduled rate changes",
  F: "Business decisions",
};

export type ChecklistItem = {
  id: string;
  key: string;
  group_key: string;
  sort_order: number;
  title: string;
  description: string;
  kind: "task" | "decision";
  editable_by: "editor" | "admin";
  link_href: string | null;
  hint_kind: "program_review" | "program_rows" | "duty_row_rate" | null;
  hint_ref: string | null;
  done: boolean;
  done_by: string | null;
  done_at: string | null;
  note: string | null;
  version: number;
  updated_by: string | null;
  updated_at: string | null;
};

// Who the signed-in user is, as far as the checklist cares (mirrors the SQL:
// an item is editable by tariff editors and admins, or by admins only).
export type ChecklistPermissions = { isAdmin: boolean; canEditTariffData: boolean };

export function canChange(item: Pick<ChecklistItem, "editable_by">, permissions: ChecklistPermissions): boolean {
  return item.editable_by === "admin" ? permissions.isAdmin : permissions.canEditTariffData;
}

export type Progress = { done: number; total: number };

export function progress(items: Pick<ChecklistItem, "done">[]): Progress {
  return { done: items.filter((i) => i.done).length, total: items.length };
}

export function progressText(p: Progress): string {
  return `${p.done} of ${p.total} done`;
}

export function groupItems<T extends Pick<ChecklistItem, "group_key" | "sort_order">>(
  items: T[],
): { group: string; title: string; items: T[] }[] {
  const keys = [...new Set(items.map((i) => i.group_key))].sort();
  return keys.map((group) => ({
    group,
    title: GROUP_TITLES[group] ?? group,
    items: items.filter((i) => i.group_key === group).sort((a, b) => a.sort_order - b.sort_order),
  }));
}

// A read-only status built from the app's own duty data.
export type ChecklistHint =
  | { kind: "review"; status: ReviewStatus }
  | { kind: "rows"; count: number }
  | { kind: "rate"; text: string };

export type ChecklistView = ChecklistItem & { hint: ChecklistHint | null };

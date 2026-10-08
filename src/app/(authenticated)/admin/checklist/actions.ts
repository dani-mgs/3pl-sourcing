"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getTariffPermissions } from "@/lib/auth/get-tariff-permissions";
import { parseSetItem } from "@/lib/checklist/parse-checklist-input";

// Ticks, unticks or notes one checklist item, for tariff editors and admins.
// Uses the signed-in user's own client: set_checklist_item() checks the role
// per item and records who did it, and the tables have no direct write
// access (docs/SECURITY.md, "Expert checklist"). It changes no duty data.
// Flagged for rate-limiting review with the other mutating actions.

export type ChecklistActionState = { error?: string; version?: number };

const NO_PERMISSION = "You don't have permission to change this item.";
const CONFLICT = "Someone else changed this item. Reload the page to see the latest, then try again.";
const UNEXPECTED = "An unexpected error occurred.";

export async function setChecklistItem(raw: {
  itemId: unknown;
  done: unknown;
  note: unknown;
  version: unknown;
}): Promise<ChecklistActionState> {
  const { canEditTariffData } = await getTariffPermissions();
  if (!canEditTariffData) return { error: NO_PERMISSION };

  const parsed = parseSetItem(raw);
  if (!parsed.ok) return { error: parsed.error };
  const { itemId, done, note, version } = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("set_checklist_item", {
    p_item: itemId,
    p_done: done,
    p_note: note,
    p_expected_version: version,
  });
  if (error) {
    console.error("setChecklistItem error:", error);
    if (error.code === "42501") return { error: NO_PERMISSION };
    if (error.code === "PT409") return { error: CONFLICT };
    return { error: UNEXPECTED };
  }

  revalidatePath("/admin/checklist");
  return { version: typeof data === "number" ? data : undefined };
}

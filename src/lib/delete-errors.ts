import type { SupabaseClient } from "@supabase/supabase-js";

const NO_PERMISSION_ERROR = "You don't have permission to make this change.";
const NO_LONGER_EXISTS_ERROR = "This item no longer exists — refresh the page.";

// A delete that returns zero rows means either RLS rejected it (the row exists
// but this user can't delete it) or the row was already gone (e.g. deleted in
// another tab). Reads are open to every authenticated user, so a follow-up
// lookup tells the two apart.
export async function explainEmptyDelete(
  supabase: SupabaseClient,
  table:
    | "three_pl_providers"
    | "three_pl_projects"
    | "clients"
    | "forwarder_projects"
    | "forwarders"
    | "forwarder_quotes",
  id: string,
): Promise<string> {
  const { data, error } = await supabase
    .from(table)
    .select("id")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("explainEmptyDelete lookup error:", error);
    return NO_PERMISSION_ERROR;
  }

  return data ? NO_PERMISSION_ERROR : NO_LONGER_EXISTS_ERROR;
}

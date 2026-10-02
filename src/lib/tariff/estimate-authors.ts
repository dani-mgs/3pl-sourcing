import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

// Display names for the users who saved estimates, by user id (first name,
// else email), from profiles (readable by any signed-in user).
export async function loadAuthorNames(supabase: Supabase, ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const { data, error } = await supabase.from("profiles").select("id, email, first_name").in("id", unique);
  if (error) {
    console.error("loadAuthorNames error:", error);
    return new Map();
  }
  return new Map(
    (data ?? []).map((p) => [p.id as string, (p.first_name as string | null)?.trim() || (p.email as string)]),
  );
}

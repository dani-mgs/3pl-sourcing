import { createClient } from "@/lib/supabase/server";

export type UserRole = "admin" | "logistics_expert";

export async function getUserRole(): Promise<UserRole> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user?.app_metadata?.role === "admin" ? "admin" : "logistics_expert";
}

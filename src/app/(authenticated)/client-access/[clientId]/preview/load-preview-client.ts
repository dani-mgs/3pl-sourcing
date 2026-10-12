import { notFound } from "next/navigation";
import { z } from "zod";
import { getStaffRole } from "@/lib/auth/get-user-role";
import { createClient } from "@/lib/supabase/server";

// "View as client" pages: staff only, for a real client.
export async function loadPreviewClient(clientId: string) {
  if (!(await getStaffRole())) notFound();
  if (!z.uuid().safeParse(clientId).success) notFound();
  const supabase = await createClient();
  const { data: client } = await supabase.from("clients").select("id, name").eq("id", clientId).maybeSingle();
  if (!client) notFound();
  return { supabase, client: client as { id: string; name: string } };
}

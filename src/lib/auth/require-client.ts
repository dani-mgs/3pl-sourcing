import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { userRole } from "./roles";

export type ClientUser = {
  userId: string;
  clientId: string;
  firstName: string | null;
  mustChangePassword: boolean;
};

// The first statement of every portal page and Server Action
// (server-action-guard.test.ts enforces it for actions). Only a client user
// with a client gets through; staff and everyone else get a 404, as the
// proxy does. app_metadata is read live from Supabase Auth (getUser).
export async function requireClient(): Promise<ClientUser> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const meta = user?.app_metadata;
  const clientId = typeof meta?.client_id === "string" ? meta.client_id : null;
  if (!user || userRole(meta) !== "client" || !clientId) notFound();
  const firstName = typeof meta?.first_name === "string" && meta.first_name.trim() ? meta.first_name.trim() : null;
  return { userId: user.id, clientId, firstName, mustChangePassword: meta?.must_change_password === true };
}

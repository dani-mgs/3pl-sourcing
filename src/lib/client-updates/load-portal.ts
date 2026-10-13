import type { createClient } from "@/lib/supabase/server";
import type { ClientTier } from "@/lib/admin/parse-admin-input";
import { effectiveTier } from "@/lib/client-tiers";
import { toPortalData, type PortalData, type PortalRow } from "./portal-data";

// The one loader behind the client portal and staff "View as client". Both
// go through the same SQL (portal_updates_rows, via my_portal_updates() for
// a client or portal_updates_for_client() for staff): published updates of
// that one client, client-safe columns only. The tier decides only which
// static Market Report text shows; no report data is read here.
// Server-side only.

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type PortalLoad = PortalData & { tier: ClientTier; contactNames: string[] };

export type PortalViewer = { as: "client" } | { as: "staff"; clientId: string };

function firstWord(name: string | null): string | null {
  const word = name?.trim().split(/\s+/)[0] ?? "";
  return word === "" ? null : word;
}

export async function loadPortal(supabase: Supabase, viewer: PortalViewer): Promise<PortalLoad> {
  if (viewer.as === "client") {
    const [updates, names, entitlement] = await Promise.all([
      supabase.rpc("my_portal_updates"),
      supabase.rpc("my_move_contact_names"),
      // RLS: a client reads only its own client's row.
      supabase.from("client_entitlements").select("tier, valid_until").maybeSingle(),
    ]);
    if (updates.error) console.error("my_portal_updates failed:", updates.error.code);
    return {
      ...toPortalData((updates.data ?? []) as PortalRow[]),
      tier: effectiveTier(entitlement.data),
      contactNames: ((names.data ?? []) as { first_name: string }[]).map((n) => n.first_name),
    };
  }

  // Staff: the same rows through the staff function, and the same contact
  // rule (first word of each staff owner's name) from tables staff can read.
  const [updates, entitlement, threePl, forwarder] = await Promise.all([
    supabase.rpc("portal_updates_for_client", { p_client_id: viewer.clientId }),
    supabase.from("client_entitlements").select("tier, valid_until").eq("client_id", viewer.clientId).maybeSingle(),
    supabase.from("three_pl_projects").select("owner_id").eq("client_id", viewer.clientId),
    supabase.from("forwarder_projects").select("owner_id").eq("client_id", viewer.clientId),
  ]);
  if (updates.error) console.error("portal_updates_for_client failed:", updates.error.code);
  const ownerIds = [...new Set([...(threePl.data ?? []), ...(forwarder.data ?? [])].map((p) => p.owner_id as string))];
  const { data: owners } = ownerIds.length
    ? await supabase.from("profiles").select("first_name, role").in("id", ownerIds)
    : { data: [] };
  const contactNames = [
    ...new Set(
      (owners ?? [])
        .filter((o) => o.role === "admin" || o.role === "logistics_expert")
        .map((o) => firstWord(o.first_name as string | null))
        .filter((n): n is string => n != null),
    ),
  ].sort();
  return {
    ...toPortalData((updates.data ?? []) as PortalRow[]),
    tier: effectiveTier(entitlement.data),
    contactNames,
  };
}

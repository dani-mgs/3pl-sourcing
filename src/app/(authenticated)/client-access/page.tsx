import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getStaffRole } from "@/lib/auth/get-user-role";
import { listClients } from "@/lib/clients";
import { adminUserLabel } from "@/lib/admin/user-label";
import { TIER_LABELS, tiersByClientId } from "@/lib/client-tiers";
import { CreateClientUserForm } from "./create-client-user-form";
import { ResetClientPasswordButton } from "./reset-client-password-button";

// Portal logins for clients. Admins and logistics experts create them
// (experts only for clients of projects they own); admins also reset their
// passwords and, in Administration, set each client's plan.
export default async function ClientAccessPage() {
  const role = await getStaffRole();
  if (!role) notFound();
  const isAdmin = role === "admin";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [clients, { data: portalUsers }, { data: entitlements }, owned3pl, ownedForwarder] = await Promise.all([
    listClients(supabase),
    supabase.from("profiles").select("id, email, first_name, client_id").eq("role", "client").order("email"),
    supabase.from("client_entitlements").select("client_id, tier, valid_until"),
    supabase.from("three_pl_projects").select("client_id").eq("owner_id", user?.id ?? ""),
    supabase.from("forwarder_projects").select("client_id").eq("owner_id", user?.id ?? ""),
  ]);

  const ownedClientIds = new Set([...(owned3pl.data ?? []), ...(ownedForwarder.data ?? [])].map((p) => p.client_id));
  const creatableClients = isAdmin ? clients : clients.filter((c) => ownedClientIds.has(c.id));

  const tierByClientId = tiersByClientId(entitlements);

  const usersByClientId = new Map<string, NonNullable<typeof portalUsers>>();
  for (const portalUser of portalUsers ?? []) {
    if (!portalUser.client_id) continue;
    usersByClientId.set(portalUser.client_id, [...(usersByClientId.get(portalUser.client_id) ?? []), portalUser]);
  }
  const clientsWithUsers = clients.filter((c) => usersByClientId.has(c.id));

  return (
    <div className="max-w-6xl px-8 py-10 max-sm:px-4">
      <h1 className="font-display text-2xl font-semibold text-move-navy">Client access</h1>
      <p className="mt-1 mb-8 max-w-3xl text-sm text-neutral-muted">
        Portal logins for your clients. A portal user sees only what Move publishes for their own
        company, never internal data. The portal itself is coming soon: for now they can sign in and
        set their password.
      </p>

      <div className="flex flex-col gap-8">
        <section
          aria-labelledby="create-client-user-heading"
          className="rounded-2xl border border-neutral-border bg-white p-6 shadow-sm"
        >
          <h2 id="create-client-user-heading" className="font-display text-lg font-semibold text-move-navy">
            Add a portal user
          </h2>
          <p className="mb-4 text-xs text-neutral-muted">
            {isAdmin
              ? "Admins can add portal users for any client."
              : "You can add portal users for clients of projects you own."}{" "}
            No email is sent: you get a one-time password to pass on, and they choose their own at
            first sign-in.
          </p>
          {creatableClients.length === 0 ? (
            <p className="text-sm text-neutral-muted">
              You don&apos;t own a project for any client yet, so there&apos;s no client you can add a
              portal user for. Ask an admin.
            </p>
          ) : (
            <CreateClientUserForm clients={creatableClients.map((c) => ({ id: c.id, name: c.name }))} />
          )}
        </section>

        <section
          aria-labelledby="portal-users-heading"
          className="rounded-2xl border border-neutral-border bg-white p-6 shadow-sm"
        >
          <h2 id="portal-users-heading" className="font-display text-lg font-semibold text-move-navy">
            Portal users
          </h2>
          <p className="mb-4 text-xs text-neutral-muted">
            {isAdmin ? (
              <>
                Plans are set in <Link href="/admin" className="underline">Administration</Link> → Clients.
                Remove a portal user in User &amp; Role Management.
              </>
            ) : (
              "Plans are set by admins. Ask an admin to reset a password or remove a portal user."
            )}
          </p>
          {clientsWithUsers.length === 0 ? (
            <p className="py-4 text-sm text-neutral-muted">No portal users yet.</p>
          ) : (
            <div className="flex flex-col gap-6">
              {clientsWithUsers.map((client) => (
                <div key={client.id} className="border-b border-neutral-border pb-4 last:border-b-0 last:pb-0">
                  <p className="text-sm font-medium text-move-navy">
                    {client.name}
                    <span className="font-normal text-neutral-muted">
                      {" "}
                      · {TIER_LABELS[tierByClientId.get(client.id) ?? "free"]}
                    </span>
                  </p>
                  <ul className="mt-2 flex flex-col gap-2">
                    {(usersByClientId.get(client.id) ?? []).map((portalUser) => (
                      <li key={portalUser.id} className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm text-move-navy">
                          {adminUserLabel(portalUser.first_name, portalUser.email, "parens")}
                        </span>
                        {isAdmin && (
                          <ResetClientPasswordButton
                            userId={portalUser.id}
                            userLabel={adminUserLabel(portalUser.first_name, portalUser.email, "parens")}
                          />
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

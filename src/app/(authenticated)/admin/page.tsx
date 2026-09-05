import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserRole } from "@/lib/auth/get-user-role";
import { ReassignOwnerForm, type ProfileOption } from "./reassign-owner-form";
import { RoleActionButton } from "./role-action-button";

export default async function AdministrationPage() {
  const role = await getUserRole();

  if (role !== "admin") {
    notFound();
  }

  const supabase = await createClient();

  const {
    data: { user: currentUser },
  } = await supabase.auth.getUser();

  const { data: clientRequirements } = await supabase
    .from("client_requirements")
    .select("id, client_name, owner_id")
    .order("client_name", { ascending: true });

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, email, first_name, role")
    .order("email", { ascending: true });

  const profileOptions: ProfileOption[] = (profiles ?? []).map((p) => ({
    id: p.id,
    email: p.email,
    first_name: p.first_name,
  }));

  const ownerDisplayById = new Map(
    (profiles ?? []).map((p) => [p.id, p.first_name?.trim() || p.email]),
  );

  return (
    <div className="max-w-6xl px-8 py-10">
      <h1 className="mb-8 font-display text-2xl font-semibold text-move-navy">
        Administration
      </h1>

      <div className="flex flex-col gap-8">
        <section className="rounded-2xl border border-neutral-border bg-white p-6 shadow-sm">
          <h2 className="mb-4 font-display text-lg font-semibold text-move-navy">
            Project Reassignment
          </h2>

          {!clientRequirements || clientRequirements.length === 0 ? (
            <p className="py-4 text-sm text-neutral-muted">
              No clients yet.
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              {clientRequirements.map((clientRequirement) => (
                <div
                  key={clientRequirement.id}
                  className="flex flex-wrap items-center justify-between gap-4 border-b border-neutral-border pb-4 last:border-b-0 last:pb-0"
                >
                  <div>
                    <p className="text-sm font-medium text-move-navy">
                      {clientRequirement.client_name}
                    </p>
                    <p className="text-xs text-neutral-muted">
                      Currently owned by{" "}
                      {ownerDisplayById.get(clientRequirement.owner_id) ??
                        "—"}
                    </p>
                  </div>
                  <ReassignOwnerForm
                    clientRequirementId={clientRequirement.id}
                    currentOwnerId={clientRequirement.owner_id}
                    profiles={profileOptions}
                  />
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-neutral-border bg-white p-6 shadow-sm">
          <h2 className="mb-4 font-display text-lg font-semibold text-move-navy">
            User &amp; Role Management
          </h2>

          {!profiles || profiles.length === 0 ? (
            <p className="py-4 text-sm text-neutral-muted">No users yet.</p>
          ) : (
            <div className="flex flex-col gap-4">
              {profiles.map((profile) => (
                <div
                  key={profile.id}
                  className="flex flex-wrap items-center justify-between gap-4 border-b border-neutral-border pb-4 last:border-b-0 last:pb-0"
                >
                  <div>
                    <p className="text-sm font-medium text-move-navy">
                      {profile.first_name?.trim() || profile.email}
                    </p>
                    <p className="text-xs text-neutral-muted">
                      {profile.email} · {profile.role}
                    </p>
                  </div>
                  {profile.role === "admin" ? (
                    profile.id !== currentUser?.id && (
                      <RoleActionButton
                        userId={profile.id}
                        newRole="logistics_expert"
                        label="Demote to Logistics Expert"
                      />
                    )
                  ) : (
                    <RoleActionButton
                      userId={profile.id}
                      newRole="admin"
                      label="Promote to Admin"
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

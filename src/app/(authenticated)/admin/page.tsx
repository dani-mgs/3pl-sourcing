import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserRole } from "@/lib/auth/get-user-role";
import { ReassignOwnerForm, type ProfileOption } from "./reassign-owner-form";
import { adminUserLabel } from "@/lib/admin/user-label";
import { RoleActionButton } from "./role-action-button";
import { TariffEditorButton } from "./tariff-editor-button";
import { EditNameButton } from "./edit-name-button";
import { CreateUserButton } from "./create-user-button";
import { DeleteUserButton } from "./delete-user-button";
import { DeleteClientButton } from "./delete-client-button";
import { EditClientDialog } from "@/components/edit-client-dialog";
import { embeddedOne, listClients } from "@/lib/clients";

export default async function AdministrationPage() {
  const role = await getUserRole();

  if (role !== "admin") {
    notFound();
  }

  const supabase = await createClient();

  const {
    data: { user: currentUser },
  } = await supabase.auth.getUser();

  const [{ data: projectRows }, { data: forwarderRows }, clients] =
    await Promise.all([
      supabase
        .from("three_pl_projects")
        .select("id, owner_id, client_id, target_geography, clients(name)"),
      supabase
        .from("forwarder_projects")
        .select(
          "id, owner_id, client_id, origin_country, destination_country, clients(name)",
        ),
      listClients(supabase),
    ]);

  // Every module's projects, labelled by module, for reassignment and for
  // the per-client and per-owner counts that block deletes.
  const projects = [
    ...(projectRows ?? []).map((project) => ({
      id: project.id,
      owner_id: project.owner_id,
      client_id: project.client_id,
      table: "three_pl_projects" as const,
      moduleName: "3PL Sourcing",
      detail: project.target_geography,
      clientName: embeddedOne(project.clients)?.name ?? "—",
    })),
    ...(forwarderRows ?? []).map((project) => ({
      id: project.id,
      owner_id: project.owner_id,
      client_id: project.client_id,
      table: "forwarder_projects" as const,
      moduleName: "Forwarder Sourcing",
      detail:
        project.origin_country || project.destination_country
          ? `${project.origin_country ?? "—"} → ${project.destination_country ?? "—"}`
          : null,
      clientName: embeddedOne(project.clients)?.name ?? "—",
    })),
  ].sort(
    (a, b) =>
      a.clientName.localeCompare(b.clientName) ||
      a.moduleName.localeCompare(b.moduleName),
  );

  const projectCountByClientId = new Map<string, number>();
  for (const project of projects) {
    projectCountByClientId.set(
      project.client_id,
      (projectCountByClientId.get(project.client_id) ?? 0) + 1,
    );
  }

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, email, first_name, role, tariff_editor")
    .order("email", { ascending: true });

  const profileOptions: ProfileOption[] = (profiles ?? []).map((p) => ({
    id: p.id,
    email: p.email,
    first_name: p.first_name,
  }));

  const ownerDisplayById = new Map(
    (profiles ?? []).map((p) => [p.id, adminUserLabel(p.first_name, p.email, "dot")]),
  );

  const ownedProjectCountById = new Map<string, number>();
  for (const project of projects) {
    ownedProjectCountById.set(
      project.owner_id,
      (ownedProjectCountById.get(project.owner_id) ?? 0) + 1,
    );
  }

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

          {projects.length === 0 ? (
            <p className="py-4 text-sm text-neutral-muted">
              No projects yet.
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              {projects.map((project) => (
                <div
                  key={project.id}
                  className="flex flex-wrap items-center justify-between gap-4 border-b border-neutral-border pb-4 last:border-b-0 last:pb-0"
                >
                  <div>
                    <p className="text-sm font-medium text-move-navy">
                      {project.clientName}
                      {project.detail && (
                        <span className="font-normal text-neutral-muted">
                          {" "}
                          · {project.detail}
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-neutral-muted">
                      {project.moduleName} · Currently owned by{" "}
                      {ownerDisplayById.get(project.owner_id) ?? "—"}
                    </p>
                  </div>
                  <ReassignOwnerForm
                    clientRequirementId={project.id}
                    currentOwnerId={project.owner_id}
                    profiles={profileOptions}
                    table={project.table}
                  />
                </div>
              ))}
            </div>
          )}
        </section>

        <section
          aria-labelledby="admin-clients-heading"
          className="rounded-2xl border border-neutral-border bg-white p-6 shadow-sm"
        >
          <h2
            id="admin-clients-heading"
            className="font-display text-lg font-semibold text-move-navy"
          >
            Clients
          </h2>
          <p className="mb-4 text-xs text-neutral-muted">
            Shared across projects. A client can only be deleted once it has
            no projects.
          </p>

          {clients.length === 0 ? (
            <p className="py-4 text-sm text-neutral-muted">No clients yet.</p>
          ) : (
            <div className="flex flex-col gap-4">
              {clients.map((client) => {
                const projectCount = projectCountByClientId.get(client.id) ?? 0;
                return (
                  <div
                    key={client.id}
                    className="flex flex-wrap items-center justify-between gap-4 border-b border-neutral-border pb-4 last:border-b-0 last:pb-0"
                  >
                    <div>
                      <p className="text-sm font-medium text-move-navy">
                        {client.name}
                      </p>
                      <p className="text-xs text-neutral-muted">
                        {client.business_model || "No business model"} ·{" "}
                        {projectCount} project{projectCount === 1 ? "" : "s"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <EditClientDialog
                        clientId={client.id}
                        currentName={client.name}
                        currentBusinessModel={client.business_model}
                      />
                      <DeleteClientButton
                        clientId={client.id}
                        clientName={client.name}
                        projectCount={projectCount}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-neutral-border bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-move-navy">
              User &amp; Role Management
            </h2>
            <CreateUserButton />
          </div>

          {!profiles || profiles.length === 0 ? (
            <p className="py-4 text-sm text-neutral-muted">No users yet.</p>
          ) : (
            <div className="flex flex-col gap-4">
              {profiles.map((profile) => (
                <div
                  key={profile.id}
                  className="flex flex-wrap items-center justify-between gap-4 border-b border-neutral-border pb-4 last:border-b-0 last:pb-0"
                >
                  <div className="flex items-center gap-2">
                    <div>
                      <p className="text-sm font-medium text-move-navy">
                        {profile.first_name?.trim() || profile.email}
                      </p>
                      <p className="text-xs text-neutral-muted">
                        {profile.email} · {profile.role === "none" ? "no role" : profile.role}
                        {profile.role !== "admin" && profile.tariff_editor && " · tariff editor"}
                      </p>
                    </div>
                    <EditNameButton
                      userId={profile.id}
                      currentName={profile.first_name?.trim() ?? ""}
                      displayLabel={profile.first_name?.trim() || profile.email}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Admins can already edit duty data; the flag only matters for others. */}
                    {profile.role !== "admin" && (
                      <TariffEditorButton userId={profile.id} isEditor={profile.tariff_editor === true} />
                    )}
                    {profile.role === "admin" ? (
                      profile.id !== currentUser?.id && (
                        <RoleActionButton
                          userId={profile.id}
                          newRole="logistics_expert"
                          label="Demote to Logistics Expert"
                        />
                      )
                    ) : (
                      <>
                        {/* An account without a role sees nothing until an admin assigns one. */}
                        {profile.role === "none" && (
                          <RoleActionButton
                            userId={profile.id}
                            newRole="logistics_expert"
                            label="Make Logistics Expert"
                          />
                        )}
                        <RoleActionButton
                          userId={profile.id}
                          newRole="admin"
                          label="Promote to Admin"
                        />
                      </>
                    )}
                    {profile.id !== currentUser?.id && (
                      <DeleteUserButton
                        userId={profile.id}
                        email={profile.email}
                        ownedClientCount={
                          ownedProjectCountById.get(profile.id) ?? 0
                        }
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

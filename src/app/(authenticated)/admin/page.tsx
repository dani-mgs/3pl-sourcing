import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserRole } from "@/lib/auth/get-user-role";
import { ProjectStatusBadge } from "../project-status-badge";

export default async function AdminMasterListPage() {
  const role = await getUserRole();

  if (role !== "admin") {
    notFound();
  }

  const supabase = await createClient();

  const { data: clientRequirements } = await supabase
    .from("client_requirements")
    .select("id, client_name, status, date_created, owner_id")
    .order("date_created", { ascending: false });

  const ownerIds = Array.from(
    new Set((clientRequirements ?? []).map((cr) => cr.owner_id)),
  );

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, email, first_name")
    .in("id", ownerIds.length > 0 ? ownerIds : [""]);

  const ownerNameById = new Map(
    (profiles ?? []).map((profile) => [
      profile.id,
      profile.first_name?.trim() || profile.email,
    ]),
  );

  const { data: providers } = await supabase
    .from("three_pl_providers")
    .select("client_requirement_id");

  const providerCountByClientId = new Map<string, number>();
  for (const provider of providers ?? []) {
    providerCountByClientId.set(
      provider.client_requirement_id,
      (providerCountByClientId.get(provider.client_requirement_id) ?? 0) + 1,
    );
  }

  return (
    <div className="max-w-6xl px-8 py-10">
      <h1 className="mb-8 font-display text-2xl font-semibold text-move-navy">
        Master List
      </h1>

      {!clientRequirements || clientRequirements.length === 0 ? (
        <div className="rounded-2xl border border-neutral-border bg-white p-6 shadow-sm">
          <p className="py-8 text-center text-sm text-neutral-muted">
            No clients yet.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-neutral-border bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-neutral-border">
                <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-neutral-muted">
                  Client
                </th>
                <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-neutral-muted">
                  Owner
                </th>
                <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-neutral-muted">
                  Status
                </th>
                <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-neutral-muted">
                  Date Created
                </th>
                <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-neutral-muted">
                  3PLs Sourced
                </th>
              </tr>
            </thead>
            <tbody>
              {clientRequirements.map((clientRequirement) => (
                <tr
                  key={clientRequirement.id}
                  className="border-b border-neutral-border last:border-b-0 hover:bg-neutral-bg"
                >
                  <td className="px-0 py-0">
                    <Link
                      href={`/projects/${clientRequirement.id}`}
                      className="block px-4 py-3 text-move-navy"
                    >
                      {clientRequirement.client_name}
                    </Link>
                  </td>
                  <td className="px-0 py-0">
                    <Link
                      href={`/projects/${clientRequirement.id}`}
                      className="block px-4 py-3 text-neutral-muted"
                    >
                      {ownerNameById.get(clientRequirement.owner_id) ?? "—"}
                    </Link>
                  </td>
                  <td className="px-0 py-0">
                    <Link
                      href={`/projects/${clientRequirement.id}`}
                      className="block px-4 py-3"
                    >
                      <ProjectStatusBadge status={clientRequirement.status} />
                    </Link>
                  </td>
                  <td className="px-0 py-0">
                    <Link
                      href={`/projects/${clientRequirement.id}`}
                      className="block px-4 py-3 text-neutral-muted"
                    >
                      {new Date(
                        clientRequirement.date_created,
                      ).toLocaleDateString()}
                    </Link>
                  </td>
                  <td className="px-0 py-0">
                    <Link
                      href={`/projects/${clientRequirement.id}`}
                      className="block px-4 py-3 text-move-navy"
                    >
                      {providerCountByClientId.get(clientRequirement.id) ?? 0}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

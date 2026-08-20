import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { StatusBadge, type ProviderStatus } from "./status-badge";

export default async function ProvidersPage({
  params,
}: PageProps<"/projects/[id]/providers">) {
  const { id } = await params;

  const supabase = await createClient();

  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("id", id)
    .single();

  if (!project) {
    notFound();
  }

  const { data: providers } = await supabase
    .from("providers")
    .select("id, company_name, contact_person, location, status")
    .eq("project_id", id)
    .order("created_at", { ascending: false });

  return (
    <div className="max-w-5xl px-8 py-10">
      <Link
        href={`/projects/${id}`}
        className="text-sm font-medium text-move-green hover:underline"
      >
        ← Back to project
      </Link>

      <div className="mt-2 mb-8 flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold text-move-navy">
          3PL List
        </h1>
        <Link
          href={`/projects/${id}/providers/new`}
          className="rounded-xl bg-move-green px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-move-green-hover"
        >
          Add Provider
        </Link>
      </div>

      {!providers || providers.length === 0 ? (
        <div className="rounded-2xl border border-neutral-border bg-white p-6 shadow-sm">
          <p className="py-8 text-center text-sm text-neutral-muted">
            No providers yet. Add your first one to get started.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-neutral-border bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-neutral-border">
                <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-neutral-muted">
                  Company
                </th>
                <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-neutral-muted">
                  Contact
                </th>
                <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-neutral-muted">
                  Location
                </th>
                <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-neutral-muted">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {providers.map((provider) => (
                <tr
                  key={provider.id}
                  className="border-b border-neutral-border last:border-b-0 hover:bg-neutral-bg"
                >
                  <td className="px-0 py-0">
                    <Link
                      href={`/projects/${id}/providers/${provider.id}`}
                      className="block px-4 py-3 text-move-navy"
                    >
                      {provider.company_name}
                    </Link>
                  </td>
                  <td className="px-0 py-0">
                    <Link
                      href={`/projects/${id}/providers/${provider.id}`}
                      className="block px-4 py-3 text-move-navy"
                    >
                      {provider.contact_person}
                    </Link>
                  </td>
                  <td className="px-0 py-0">
                    <Link
                      href={`/projects/${id}/providers/${provider.id}`}
                      className="block px-4 py-3 text-neutral-muted"
                    >
                      {provider.location}
                    </Link>
                  </td>
                  <td className="px-0 py-0">
                    <Link
                      href={`/projects/${id}/providers/${provider.id}`}
                      className="block px-4 py-3"
                    >
                      <StatusBadge status={provider.status as ProviderStatus} />
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

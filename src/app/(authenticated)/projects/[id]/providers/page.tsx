import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type ProviderStatus =
  | "Potential"
  | "Contacted"
  | "Discovery Call"
  | "Quotation Received"
  | "Negotiation"
  | "Vetted"
  | "Rejected";

const STATUS_STYLES: Record<ProviderStatus, string> = {
  Potential: "bg-[#F1F2F6] text-[#6B7280]",
  Contacted: "bg-[#E8E7FC] text-[#4F46E5]",
  "Discovery Call": "bg-[#FEF3E2] text-[#B45309]",
  "Quotation Received": "bg-[#FEF3E2] text-[#F59E0B]",
  Negotiation: "bg-[#FFE4E0] text-[#EA580C]",
  Vetted: "bg-[#D1FAE5] text-[#059669]",
  Rejected: "bg-[#FFE1E7] text-[#E11D48]",
};

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
    <div className="mx-auto max-w-4xl px-4 py-8">
      <Link
        href={`/projects/${id}`}
        className="text-sm font-medium text-route-indigo hover:underline"
      >
        ← Back to project
      </Link>

      <div className="mt-2 mb-6 flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold text-ink-navy">
          3PL List
        </h1>
        <Link
          href={`/projects/${id}/providers/new`}
          className="rounded-xl bg-route-indigo px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-route-indigo-hover"
        >
          Add Provider
        </Link>
      </div>

      {!providers || providers.length === 0 ? (
        <div className="rounded-2xl border border-fog bg-white p-6 shadow-sm">
          <p className="py-8 text-center text-sm text-slate">
            No providers yet. Add your first one to get started.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-fog bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-fog">
                <th className="px-4 py-2 text-xs font-medium uppercase tracking-wide text-slate">
                  Company
                </th>
                <th className="px-4 py-2 text-xs font-medium uppercase tracking-wide text-slate">
                  Contact
                </th>
                <th className="px-4 py-2 text-xs font-medium uppercase tracking-wide text-slate">
                  Location
                </th>
                <th className="px-4 py-2 text-xs font-medium uppercase tracking-wide text-slate">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {providers.map((provider) => (
                <tr
                  key={provider.id}
                  className="border-b border-fog last:border-b-0 hover:bg-mist"
                >
                  <td className="px-0 py-0">
                    <Link
                      href={`/projects/${id}/providers/${provider.id}`}
                      className="block px-4 py-2 text-ink-navy"
                    >
                      {provider.company_name}
                    </Link>
                  </td>
                  <td className="px-0 py-0">
                    <Link
                      href={`/projects/${id}/providers/${provider.id}`}
                      className="block px-4 py-2 text-ink-navy"
                    >
                      {provider.contact_person}
                    </Link>
                  </td>
                  <td className="px-0 py-0">
                    <Link
                      href={`/projects/${id}/providers/${provider.id}`}
                      className="block px-4 py-2 text-slate"
                    >
                      {provider.location}
                    </Link>
                  </td>
                  <td className="px-0 py-0">
                    <Link
                      href={`/projects/${id}/providers/${provider.id}`}
                      className="block px-4 py-2"
                    >
                      <span
                        className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium ${
                          STATUS_STYLES[provider.status as ProviderStatus]
                        }`}
                      >
                        {provider.status}
                      </span>
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

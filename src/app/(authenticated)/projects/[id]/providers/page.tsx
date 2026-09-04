import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOwnershipContext } from "@/lib/auth/get-ownership-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge, type ProviderStatus } from "./status-badge";

const USD_FORMATTER = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

export default async function ProvidersPage({
  params,
}: PageProps<"/projects/[id]/providers">) {
  const { id } = await params;

  const supabase = await createClient();

  const { data: clientRequirement } = await supabase
    .from("client_requirements")
    .select("id")
    .eq("id", id)
    .single();

  if (!clientRequirement) {
    notFound();
  }

  const { canWrite } = await getOwnershipContext(id);

  const { data: providers } = await supabase
    .from("three_pl_providers")
    .select(
      "id, company_name, location, status, is_incumbent, storage_cost, pick_pack_cost, receiving_cost, returns_cost",
    )
    .eq("client_requirement_id", id)
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
        {canWrite && (
          <Button
            nativeButton={false}
            render={<Link href={`/projects/${id}/providers/new`} />}
          >
            Add Provider
          </Button>
        )}
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
                  Location
                </th>
                <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-neutral-muted">
                  Status
                </th>
                <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-neutral-muted">
                  Total Cost
                </th>
              </tr>
            </thead>
            <tbody>
              {providers.map((provider) => {
                const totalCost =
                  (provider.storage_cost ?? 0) +
                  (provider.pick_pack_cost ?? 0) +
                  (provider.receiving_cost ?? 0) +
                  (provider.returns_cost ?? 0);

                return (
                  <tr
                    key={provider.id}
                    className="border-b border-neutral-border last:border-b-0 hover:bg-neutral-bg"
                  >
                    <td className="px-0 py-0">
                      <Link
                        href={`/projects/${id}/providers/${provider.id}`}
                        className="flex items-center gap-2 px-4 py-3 text-move-navy"
                      >
                        {provider.company_name}
                        {provider.is_incumbent && (
                          <Badge variant="outline" className="border-transparent bg-[#E3F2FD] text-[#1565C0]">
                            Incumbent
                          </Badge>
                        )}
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
                    <td className="px-0 py-0">
                      <Link
                        href={`/projects/${id}/providers/${provider.id}`}
                        className="block px-4 py-3 text-move-navy"
                      >
                        {USD_FORMATTER.format(totalCost)}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  StatusBadge,
  type ProviderStatus,
} from "../providers/status-badge";

export default async function ComparisonPage({
  params,
}: PageProps<"/projects/[id]/comparison">) {
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
    .select(
      "id, company_name, location, cost, service_capability, turnaround_time, status",
    )
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

      <div className="mt-2 mb-8">
        <h1 className="font-display text-2xl font-semibold text-move-navy">
          Comparison
        </h1>
      </div>

      {!providers || providers.length === 0 ? (
        <div className="rounded-2xl border border-neutral-border bg-white p-6 shadow-sm">
          <p className="py-8 text-center text-sm text-neutral-muted">
            No providers yet.{" "}
            <Link
              href={`/projects/${id}/providers`}
              className="font-medium text-move-green hover:underline"
            >
              Add providers first
            </Link>{" "}
            to compare them here.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-neutral-border bg-white shadow-sm">
          <Table>
            <TableHeader>
              <TableRow className="border-neutral-border">
                <TableHead className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-neutral-muted">
                  Company
                </TableHead>
                <TableHead className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-neutral-muted">
                  Location
                </TableHead>
                <TableHead className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-neutral-muted">
                  Cost
                </TableHead>
                <TableHead className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-neutral-muted">
                  Service Capability
                </TableHead>
                <TableHead className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-neutral-muted">
                  Turnaround Time
                </TableHead>
                <TableHead className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-neutral-muted">
                  Status
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {providers.map((provider) => (
                <TableRow
                  key={provider.id}
                  className="border-neutral-border hover:bg-neutral-bg"
                >
                  <TableCell className="px-4 py-3 whitespace-normal text-move-navy">
                    {provider.company_name}
                  </TableCell>
                  <TableCell className="px-4 py-3 whitespace-normal text-neutral-muted">
                    {provider.location || "—"}
                  </TableCell>
                  <TableCell className="px-4 py-3 whitespace-normal text-neutral-muted">
                    {provider.cost || "—"}
                  </TableCell>
                  <TableCell className="px-4 py-3 whitespace-normal text-neutral-muted">
                    {provider.service_capability || "—"}
                  </TableCell>
                  <TableCell className="px-4 py-3 whitespace-normal text-neutral-muted">
                    {provider.turnaround_time || "—"}
                  </TableCell>
                  <TableCell className="px-4 py-3 whitespace-normal">
                    <StatusBadge status={provider.status as ProviderStatus} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

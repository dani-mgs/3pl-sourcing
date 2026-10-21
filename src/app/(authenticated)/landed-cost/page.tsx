import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { todayUtc } from "@/lib/fx/server-rates";
import { isLandedCostEnabled } from "@/lib/landed-cost/feature-flag";
import { listWorkspaces, LIST_LIMIT } from "@/lib/landed-cost/server-workspace-list";
import { ORIGIN_COUNTRIES } from "@/lib/tariff/countries";
import { entryDateBounds } from "@/lib/tariff/entry-date";
import { NewWorkspaceForm } from "./new-workspace-form";
import { cardClass, sectionTitleClass } from "./styles";

// Landed Cost: the workspaces (any staff member can open one; only its owner
// or an admin can edit it) and a form to start a new one. Behind
// LANDED_COST_ENABLED: off, this page doesn't exist.
export default async function LandedCostPage() {
  if (!isLandedCostEnabled()) notFound();
  const supabase = await createClient();
  const list = await listWorkspaces(supabase);
  const today = todayUtc();

  return (
    <div className="mx-auto max-w-6xl px-8 py-10 max-sm:px-4">
      <div className="mb-8">
        <h1 className="font-display text-2xl font-semibold text-move-navy">Landed Cost</h1>
        <p className="mt-1 text-sm text-neutral-muted">
          The full cost of one shipment from one origin, per unit: product, freight, duties, MPF, HMF and other costs.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section className={cardClass} aria-labelledby="workspaces-title">
          <h2 id="workspaces-title" className={`${sectionTitleClass} mb-4`}>
            Workspaces
          </h2>
          {!list.ok ? (
            <p className="text-sm text-danger" role="alert">
              {list.message}
            </p>
          ) : list.rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-neutral-muted">No workspaces yet. Create one to cost a shipment.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-move-navy">
                <thead>
                  <tr className="border-b border-neutral-border text-xs tracking-wide text-neutral-muted uppercase">
                    <th scope="col" className="px-4 py-3 font-medium">Name</th>
                    <th scope="col" className="px-4 py-3 font-medium">Owner</th>
                    <th scope="col" className="px-4 py-3 font-medium">Entry date</th>
                    <th scope="col" className="px-4 py-3 font-medium">Origin</th>
                    <th scope="col" className="px-4 py-3 text-right font-medium">SKUs</th>
                    <th scope="col" className="px-4 py-3 font-medium">Last updated</th>
                  </tr>
                </thead>
                <tbody>
                  {list.rows.map((w) => (
                    <tr key={w.id} className="border-b border-neutral-border last:border-0 hover:bg-neutral-bg">
                      <td className="px-4 py-3 font-medium">
                        <Link href={`/landed-cost/${w.id}`} className="text-move-green hover:underline">
                          {w.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3">{w.ownerName}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{w.entryDate}</td>
                      <td className="px-4 py-3">{w.origin}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{w.skuCount}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-neutral-muted">{w.updated}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {list.more && (
                <p className="mt-3 text-xs text-neutral-muted">Showing the {LIST_LIMIT} most recently updated workspaces.</p>
              )}
            </div>
          )}
        </section>

        <section className={`${cardClass} self-start`} aria-labelledby="new-workspace-title">
          <h2 id="new-workspace-title" className={`${sectionTitleClass} mb-4`}>
            New workspace
          </h2>
          <NewWorkspaceForm countries={ORIGIN_COUNTRIES} today={today} bounds={entryDateBounds(today)} />
        </section>
      </div>
    </div>
  );
}

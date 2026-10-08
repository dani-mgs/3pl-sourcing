import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getTariffPermissions } from "@/lib/auth/get-tariff-permissions";
import { groupItems, progress, progressText } from "@/lib/checklist/checklist";
import { loadChecklist } from "@/lib/checklist/server-checklist";
import { ChecklistItemRow } from "./checklist-item-row";

// The expert to-do checklist: a progress tracker for tariff editors and
// admins. Ticking never reviews a program or changes a rate.
export default async function ExpertChecklistPage() {
  const permissions = await getTariffPermissions();
  if (!permissions.canEditTariffData) notFound();

  const supabase = await createClient();
  const { items, names } = await loadChecklist(supabase);
  const groups = groupItems(items);

  return (
    <div className="mx-auto max-w-4xl px-8 py-10 max-sm:px-4">
      {permissions.isAdmin && (
        <Link
          href="/admin"
          className="mb-4 inline-flex items-center gap-1.5 rounded text-sm text-neutral-muted outline-none hover:text-move-navy focus-visible:ring-2 focus-visible:ring-move-green"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Administration
        </Link>
      )}
      <div className="mb-8">
        <h1 className="font-display text-2xl font-semibold text-move-navy">Expert checklist</h1>
        <p className="mt-1 max-w-3xl text-sm text-neutral-muted">
          What is still outstanding for the Tariff Calculator&apos;s duty data. This is a progress tracker only: ticking
          an item does not mark a program reviewed, change a rate or affect any estimate. Reviews and rate changes are
          made in Duty data.
        </p>
        <p className="mt-3 text-sm font-semibold text-move-navy" data-testid="checklist-overall">
          {progressText(progress(items))}
        </p>
      </div>

      <div className="flex flex-col gap-6">
        {groups.map((g) => (
          <section key={g.group} className="rounded-2xl border border-neutral-border bg-white p-6 shadow-sm max-sm:p-4">
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-display text-lg font-semibold text-move-navy">
                {g.group}. {g.title}
              </h2>
              <span className="text-sm text-neutral-muted" data-testid={`checklist-group-${g.group}`}>
                {progressText(progress(g.items))}
              </span>
            </div>
            <ul className="flex flex-col divide-y divide-neutral-border">
              {g.items.map((item) => (
                <ChecklistItemRow
                  key={item.id}
                  item={item}
                  canChange={item.editable_by === "admin" ? permissions.isAdmin : permissions.canEditTariffData}
                  doneByName={item.done_by ? (names[item.done_by] ?? null) : null}
                  updatedByName={item.updated_by ? (names[item.updated_by] ?? null) : null}
                />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

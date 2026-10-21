import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatRateDate, timestampDateUtc } from "@/lib/fx/rate-provenance";
import { toComparisonView } from "@/lib/landed-cost/comparison-view";
import { toEditorDraft } from "@/lib/landed-cost/editor-draft";
import { isLandedCostEnabled } from "@/lib/landed-cost/feature-flag";
import { toResultViews } from "@/lib/landed-cost/result-view";
import { loadLockedVersion } from "@/lib/landed-cost/server-snapshots";
import { loadFirstNames } from "@/lib/landed-cost/server-workspace-list";
import { restoreSnapshot } from "@/lib/landed-cost/snapshot-schema";
import { ORIGIN_COUNTRIES } from "@/lib/tariff/countries";
import { personName } from "@/lib/tariff/fee-audit";
import { cardClass } from "../../../styles";
import { LockedVersionView } from "./locked-version-view";

// One locked version, read-only. Rendered ONLY from the stored snapshot,
// read through its Zod schema: nothing is recalculated, and duty data or
// inputs changed since don't show here. Stored data that doesn't match the
// schema shows "This version can't be displayed" instead. Any staff member
// can open it. Behind LANDED_COST_ENABLED: off, this page doesn't exist.
export default async function LockedVersionPage({ params }: PageProps<"/landed-cost/[id]/versions/[versionId]">) {
  if (!isLandedCostEnabled()) notFound();
  const { id, versionId } = await params;
  const supabase = await createClient();
  const loaded = await loadLockedVersion(supabase, id, versionId);
  if (!loaded.ok && loaded.code === "not_found") notFound();

  const back = (
    <Link href={`/landed-cost/${id}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-move-green hover:underline">
      <ArrowLeft aria-hidden="true" className="size-4" /> Back to the workspace
    </Link>
  );
  if (!loaded.ok) {
    return (
      <div className="mx-auto max-w-6xl px-8 py-10 max-sm:px-4">
        {back}
        <p className={`${cardClass} mt-6 text-sm text-danger`} role="alert">
          This version couldn&apos;t be loaded right now. Reload to try again.
        </p>
      </div>
    );
  }

  const v = loaded.version;
  const names = await loadFirstNames(supabase, [v.created_by]).catch((error) => {
    console.error("LockedVersionPage names error:", error);
    return new Map<string, string | null>();
  });
  const lockedOn = formatRateDate(timestampDateUtc(v.created_at));
  const asOf = formatRateDate(v.as_of_date);
  const release = v.hts_release_title ? `${v.hts_release_title} (${v.hts_release_name})` : v.hts_release_name;
  const restored = v.snapshot ? restoreSnapshot(v.snapshot) : null;
  const draft = restored ? toEditorDraft(restored.workspace) : null;

  return (
    <div className="mx-auto max-w-[1680px] px-8 py-6 max-sm:px-4">
      {back}
      <div className="mt-4 mb-6">
        <h1 className="font-display text-2xl font-semibold text-move-navy">
          Locked version v{v.version_no}, locked on {lockedOn} by {personName(v.created_by, names)}
        </h1>
        <p className="mt-1 text-sm text-neutral-muted">
          {v.workspace_name} · Entry date {formatRateDate(v.entry_date)} · HTS release {release} · Duty data as of {asOf}
        </p>
        <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-move-navy" role="status">
          <span className="rounded-full bg-neutral-bg px-2 py-0.5 text-xs font-semibold">Read-only</span>
          {v.incomplete && (
            <span className="rounded-full bg-[#FFFBEB] px-2 py-0.5 text-xs font-semibold text-[#92400E]">Incomplete: duties or fees not final</span>
          )}
          This is the result as it was locked; later changes to the workspace or duty data don&apos;t show here.
        </p>
      </div>
      {restored && draft ? (
        <LockedVersionView
          draft={draft}
          views={toResultViews(restored.result, restored.workspace)}
          comparison={toComparisonView(restored.result, restored.workspace)}
          countries={ORIGIN_COUNTRIES}
          subtitle={`Locked on ${lockedOn}; duty data as of ${asOf}. Not recalculated.`}
        />
      ) : (
        <p className={`${cardClass} text-sm text-move-navy`} role="alert">
          This version can&apos;t be displayed: its stored data isn&apos;t in a form this page can read. Nothing was changed.
        </p>
      )}
    </div>
  );
}

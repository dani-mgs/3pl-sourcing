import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getUserRole } from "@/lib/auth/get-user-role";
import { formatRateDate, timestampDateUtc } from "@/lib/fx/rate-provenance";
import { todayUtc } from "@/lib/fx/server-rates";
import { isLandedCostEnabled } from "@/lib/landed-cost/feature-flag";
import { toComparisonView } from "@/lib/landed-cost/comparison-view";
import { toResultViews } from "@/lib/landed-cost/result-view";
import { computeWorkspaceResult } from "@/lib/landed-cost/server-compute";
import { loadWorkspace } from "@/lib/landed-cost/server-workspace";
import { loadFirstNames } from "@/lib/landed-cost/server-workspace-list";
import { ORIGIN_COUNTRIES } from "@/lib/tariff/countries";
import { entryDateBounds } from "@/lib/tariff/entry-date";
import { personName } from "@/lib/tariff/fee-audit";
import { releaseLabel } from "@/lib/tariff/hts-lookup";
import { cardClass } from "../styles";
import { DeleteWorkspaceButton } from "./delete-workspace-button";
import { WorkspaceEditor } from "./workspace-editor";

// One Landed Cost workspace: its inputs, edited as a local draft and saved
// whole, and its result, calculated on the server from the last save on
// every load (never stored, never taken from the browser), and with several
// origins their comparison. Any staff member
// can open it; only its owner or an admin can edit it. Behind
// LANDED_COST_ENABLED: off, this page doesn't exist.
function boundsFor(today: string) {
  const { min, max } = entryDateBounds(today);
  return { min, max, minText: formatRateDate(min), maxText: formatRateDate(max) };
}

export default async function LandedCostWorkspacePage({ params, searchParams }: PageProps<"/landed-cost/[id]">) {
  if (!isLandedCostEnabled()) notFound();
  const { id } = await params;
  const origin = (await searchParams)?.origin;

  const supabase = await createClient();
  const [loaded, { data: auth }, role, release] = await Promise.all([
    loadWorkspace(supabase, id),
    supabase.auth.getUser(),
    getUserRole(),
    supabase.from("hts_releases").select("name, title, release_start_date").eq("status", "current").maybeSingle(),
  ]);
  if (!loaded.ok && loaded.code === "not_found") notFound();

  const back = (
    <Link href="/landed-cost" className="inline-flex items-center gap-1.5 text-sm font-medium text-move-green hover:underline">
      <ArrowLeft aria-hidden="true" className="size-4" /> Landed Cost
    </Link>
  );
  if (!loaded.ok) {
    return (
      <div className="mx-auto max-w-6xl px-8 py-10 max-sm:px-4">
        {back}
        <p className={`${cardClass} mt-6 text-sm text-danger`} role="alert">
          {loaded.message}
        </p>
      </div>
    );
  }

  const workspace = loaded.workspace;
  const canEdit = auth.user?.id === workspace.ownerId || role === "admin";
  const today = todayUtc();
  const [result, names] = await Promise.all([
    workspace.scenarios.length > 0 ? computeWorkspaceResult(supabase, workspace, today) : Promise.resolve(null),
    loadFirstNames(supabase, [workspace.ownerId]).catch((error) => {
      console.error("LandedCostWorkspacePage names error:", error);
      return new Map<string, string | null>();
    }),
  ]);
  const views = toResultViews(result, workspace);
  const ownerName = personName(workspace.ownerId, names);

  return (
    // Wider than max-w-6xl: the editor and the result column side by side
    // (docs/DESIGN_SYSTEM.md, documented exceptions).
    <div className="mx-auto max-w-[1680px] px-8 py-6 max-sm:px-4">
      {back}
      {workspace.scenarios.length === 0 ? (
        <div className={`${cardClass} mt-6 flex flex-col gap-4`}>
          <h1 className="font-display text-2xl font-semibold text-move-navy">{workspace.name}</h1>
          <p className="text-sm text-move-navy" role="status">
            This workspace has no scenario, so it can&apos;t be calculated. Delete it and create a new one.
          </p>
          {canEdit && <DeleteWorkspaceButton workspaceId={workspace.id} name={workspace.name} />}
        </div>
      ) : (
        <WorkspaceEditor
          // A new updated_at (a save, or a reload after someone else's)
          // starts the editor again from the saved workspace.
          key={workspace.updatedAt}
          workspace={workspace}
          views={views}
          comparison={toComparisonView(result, workspace)}
          initialOrigin={typeof origin === "string" ? origin : null}
          canEdit={canEdit}
          ownerName={ownerName}
          countries={ORIGIN_COUNTRIES}
          bounds={boundsFor(today)}
          lastSaved={formatRateDate(timestampDateUtc(workspace.updatedAt))}
          htsRelease={
            release.data
              ? {
                  label: releaseLabel(release.data),
                  effective: release.data.release_start_date ? formatRateDate(release.data.release_start_date) : null,
                }
              : null
          }
        />
      )}
    </div>
  );
}

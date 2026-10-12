import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOwnershipContext } from "@/lib/auth/get-ownership-context";
import { getUserRole } from "@/lib/auth/get-user-role";
import { ProjectPanel } from "@/components/client-portal/project-panel";
import { LocalDate } from "@/components/client-portal/local-date";
import { PRIORITY_BASIS, threePlShortlistOf } from "@/lib/client-updates/build-three-pl-payload";
import { utcToday } from "@/lib/client-updates/dates";
import { loadForwarderSource, loadThreePlSource } from "@/lib/client-updates/load-publish-source";
import { isShortlistedForwarder } from "@/lib/client-updates/partners";
import { parsePayload } from "@/lib/client-updates/payload-schema";
import { defaultInputs, prefillFrom, type Partner, type StoredUpdate } from "@/lib/client-updates/prefill";
import { projectPath, type ShareKind } from "@/lib/client-updates/share-paths";
import { stageLabel } from "@/lib/client-updates/stages";
import { shortRouteLabel } from "@/lib/forwarder/project-display";
import { RemoveUpdateButton } from "./remove-update-button";
import { ShareForm } from "./share-form";

// "Share update with client" for one project (both modules). Staff only
// (the staff layout and RLS); writing needs the project's owner or an admin.

type UpdateRow = StoredUpdate & {
  id: string;
  is_draft: boolean;
  published_at: string | null;
  client_update_inputs: { inputs: unknown } | { inputs: unknown }[] | null;
};

export async function SharePage({ kind, projectId }: { kind: ShareKind; projectId: string }) {
  const supabase = await createClient();
  const today = utcToday();
  const table = kind === "forwarder" ? "forwarder_projects" : "three_pl_projects";

  let shortlist: Partner[];
  let suggestedId: string | null;
  let basedOn: string | null = null;
  let route: string | null;
  let clientName: string;
  if (kind === "forwarder") {
    const loaded = await loadForwarderSource(supabase, projectId);
    if (!loaded) notFound();
    const forwarders = loaded.source.forwarders.filter(isShortlistedForwarder).sort((a, b) => a.company_name.localeCompare(b.company_name));
    shortlist = forwarders.map((f) => ({ id: f.id, name: f.company_name }));
    suggestedId = forwarders.find((f) => f.assessment === "Move Recommended")?.id ?? null;
    route = shortRouteLabel(loaded.source.project);
    clientName = loaded.meta.clientName;
  } else {
    const loaded = await loadThreePlSource(supabase, projectId);
    if (!loaded) notFound();
    shortlist = threePlShortlistOf(loaded.source).map((p) => ({ id: p.id, name: p.company_name }));
    suggestedId = loaded.source.recommendation?.provider_id_1 ?? null;
    basedOn = PRIORITY_BASIS[loaded.source.recommendation?.priority ?? ""] ?? null;
    route = loaded.source.project.target_geography;
    clientName = loaded.meta.clientName;
  }

  const [{ canWrite }, role, { data: rows }] = await Promise.all([
    getOwnershipContext(projectId, table),
    getUserRole(),
    supabase
      .from("client_updates")
      .select(
        "id, stage, headline, summary, next_step, next_step_due, needs_client_action, payload, is_draft, published_at, client_update_inputs(inputs)",
      )
      .eq(kind === "forwarder" ? "forwarder_project_id" : "three_pl_project_id", projectId)
      .order("is_draft", { ascending: false })
      .order("published_at", { ascending: false }),
  ]);

  const updates = ((rows ?? []) as unknown as UpdateRow[]).map((u) => {
    const inputs = Array.isArray(u.client_update_inputs) ? u.client_update_inputs[0] : u.client_update_inputs;
    return { ...u, inputs: inputs?.inputs ?? null };
  });
  const draft = updates.find((u) => u.is_draft) ?? null;
  const published = updates.filter((u) => !u.is_draft);
  const defaults = prefillFrom(draft ?? published[0] ?? null, shortlist, defaultInputs(shortlist, suggestedId, basedOn));
  const backHref = projectPath(kind, projectId);

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-6 sm:px-8">
      <div className="mb-1 text-xs text-neutral-muted">
        <Link href={backHref} className="hover:underline">
          {clientName}
          {route ? ` · ${route}` : ""}
        </Link>
        <span className="mx-1.5">/</span>
        <span>Share update</span>
      </div>
      <h1 className="font-display text-2xl font-semibold text-move-navy">Share update with {clientName}</h1>
      <p className="mt-1 max-w-3xl text-sm text-neutral-muted">
        Clients only ever see what you publish here, built from this project&apos;s figures when you preview. Only shortlisted
        partners are named; everyone else appears only in the counts. Internal notes, assessments and statuses are never
        shared.
      </p>

      <p className="mt-4 max-w-3xl rounded-lg border border-portal-amber bg-portal-amber-bg px-4 py-3 text-sm text-portal-amber">
        Clients can&apos;t see shared updates yet: the client portal starts showing them in the next release. Until then,
        the latest update you publish here is what they&apos;ll see first.
      </p>

      {canWrite ? (
        <div className="mt-6">
          <ShareForm
            kind={kind}
            projectId={projectId}
            clientName={clientName}
            partners={shortlist}
            defaults={defaults}
            hasDraft={draft != null}
            prefilledFrom={draft ? "draft" : published.length ? "published" : null}
            today={today}
          />
        </div>
      ) : (
        <p className="mt-6 text-sm text-move-navy">Only the project&apos;s owner or an admin can share updates with its client.</p>
      )}

      <section className="mt-10" aria-labelledby="share-history">
        <h2 id="share-history" className="font-display text-lg font-semibold text-move-navy">
          Published updates
        </h2>
        <p className="text-sm text-neutral-muted">
          Newest first. Published updates can&apos;t be edited: to correct one, publish a new one. Only an admin can remove one
          that was a mistake.
        </p>
        {published.length === 0 ? (
          <p className="mt-3 text-sm text-move-navy">Nothing published for this project yet.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {published.map((u) => {
              const payload = parsePayload(u.payload);
              return (
                <li key={u.id} className="rounded-xl border border-neutral-border bg-white">
                  <details>
                    <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm text-move-navy">
                      <span className="font-semibold">{u.published_at && <LocalDate timestamp={u.published_at} />}</span>
                      <span>
                        Stage {u.stage} · {stageLabel(u.stage)}
                      </span>
                      <span className="min-w-0 break-words font-medium">{u.headline}</span>
                      {payload?.author.firstName && <span className="text-neutral-muted">by {payload.author.firstName}</span>}
                    </summary>
                    <div className="flex flex-col gap-3 border-t border-neutral-border p-4">
                      {payload ? (
                        <ProjectPanel
                          today={today}
                          update={{
                            stage: u.stage,
                            headline: u.headline,
                            summary: u.summary,
                            nextStep: u.next_step,
                            nextStepDue: u.next_step_due,
                            needsClientAction: u.needs_client_action,
                            publishedAt: u.published_at,
                            payload,
                          }}
                        />
                      ) : (
                        <p className="text-sm text-move-navy">This update can&apos;t be shown.</p>
                      )}
                      {role === "admin" && <RemoveUpdateButton kind={kind} projectId={projectId} updateId={u.id} />}
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

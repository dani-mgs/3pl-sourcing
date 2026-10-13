"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaff } from "@/lib/auth/require-staff";
import { getOwnershipContext } from "@/lib/auth/get-ownership-context";
import { createClient } from "@/lib/supabase/server";
import { anonymisedOrder, buildMarketReport, planMarketReport } from "@/lib/client-updates/build-market-report";
import { utcToday } from "@/lib/client-updates/dates";
import { loadFirstNames } from "@/lib/client-updates/load-publish-source";
import { loadMarketReportSource, type MarketReportSource } from "@/lib/client-updates/load-market-report-source";
import { provisionalLabels } from "@/lib/client-updates/market-report-labels";
import { parseReportForm, type ReportInputs } from "@/lib/client-updates/market-report-inputs";
import type { MarketReportPayload } from "@/lib/client-updates/market-report-schema";
import { isShortlistedForwarder } from "@/lib/client-updates/partners";
import { publishHash } from "@/lib/client-updates/publish-hash";
import { marketReportPath } from "@/lib/client-updates/share-paths";

// "Publish Market Report" on a forwarder project: preview, publish, and
// (admins) remove a published report. The browser sends only the form; the
// report is always rebuilt here from live data, and Publish refuses unless
// it matches what the expert previewed (including the partner letters,
// which the database hands out at publish). RLS limits writes to the
// project owner or an admin; the checks here give a clear message first.

type Fail = { error: string };
export type ReportPreviewResult = { payload: MarketReportPayload; hash: string } | Fail;
export type ReportResult = { ok: string } | Fail;

const NOT_ALLOWED = "Only the project's owner or an admin can publish its Market Report.";
const NOT_FOUND = "This project couldn't be found.";

type Prepared = {
  projectId: string;
  loaded: MarketReportSource;
  inputs: ReportInputs;
  order: string[];
  authorFirstName: string | null;
  today: string;
};

async function prepare(projectId: unknown, formData: FormData): Promise<Prepared | Fail> {
  const id = z.uuid().safeParse(projectId);
  if (!id.success) return { error: NOT_FOUND };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NOT_ALLOWED };

  const loaded = await loadMarketReportSource(supabase, id.data);
  if (!loaded) return { error: NOT_FOUND };
  const { canWrite } = await getOwnershipContext(id.data, "forwarder_projects");
  if (!canWrite) return { error: NOT_ALLOWED };

  const today = utcToday();
  const shortlistIds = loaded.source.forwarders.filter(isShortlistedForwarder).map((f) => f.id);
  const recommended = typeof formData.get("recommended") === "string" ? String(formData.get("recommended")) : "";
  const planned = planMarketReport(loaded.source, shortlistIds.includes(recommended) ? recommended : null, today, loaded.labels.byForwarder);
  const parsed = parseReportForm(
    formData,
    planned.map((p) => p.id),
    shortlistIds,
    loaded.identities,
  );
  if (!parsed.ok) return { error: parsed.error };
  const names = await loadFirstNames(supabase, [user.id]);
  return {
    projectId: id.data,
    loaded,
    inputs: parsed.data,
    order: anonymisedOrder(planned),
    authorFirstName: names.get(user.id) ?? null,
    today,
  };
}

function build(p: Prepared, labels: Map<string, string>) {
  return buildMarketReport(p.loaded.source, p.inputs, labels, { authorFirstName: p.authorFirstName }, p.today);
}

export async function previewMarketReport(projectId: string, formData: FormData): Promise<ReportPreviewResult> {
  await requireStaff();
  const prepared = await prepare(projectId, formData);
  if ("error" in prepared) return prepared;
  const built = build(prepared, provisionalLabels(prepared.loaded.labels, prepared.order));
  if (!built.ok) return { error: built.error };
  return { payload: built.payload, hash: publishHash(built.payload) };
}

export async function publishMarketReport(projectId: string, previewHash: string, formData: FormData): Promise<ReportResult> {
  await requireStaff();
  const prepared = await prepare(projectId, formData);
  if ("error" in prepared) return prepared;
  const changed = "The report has changed since your preview (the form, the project's figures or the partner letters). Preview it again, then publish.";

  // Check against the preview before taking any letters.
  const provisional = build(prepared, provisionalLabels(prepared.loaded.labels, prepared.order));
  if (!provisional.ok) return { error: provisional.error };
  if (typeof previewHash !== "string" || previewHash !== publishHash(provisional.payload)) return { error: changed };

  const supabase = await createClient();
  const { data: assigned, error: labelError } = await supabase.rpc("assign_partner_labels", {
    p_project: prepared.projectId,
    p_forwarder_ids: prepared.order,
  });
  if (labelError) {
    console.error("assign_partner_labels failed:", labelError.code);
    return { error: labelError.code === "42501" ? NOT_ALLOWED : "The report couldn't be published. Try again." };
  }
  const labels = new Map(((assigned ?? []) as { forwarder_id: string; label: string }[]).map((r) => [r.forwarder_id, r.label]));
  const built = build(prepared, labels);
  if (!built.ok) return { error: built.error };
  // Another publish took a letter in between: the client would see
  // different letters than previewed.
  if (publishHash(built.payload) !== previewHash) return { error: changed };

  const { error } = await supabase
    .from("client_market_reports")
    // client_id, published_by and published_at are set by the database.
    .insert({ forwarder_project_id: prepared.projectId, payload: built.payload, inputs: prepared.inputs });
  if (error) {
    console.error("market report insert failed:", error.code);
    return { error: "The report couldn't be published. Try again." };
  }
  revalidatePath(marketReportPath(prepared.projectId));
  return { ok: `Published for ${prepared.loaded.meta.clientName}.` };
}

// Admins only: remove a published report that was a mistake. (RLS also lets
// only admins delete one.) The client then sees the previous report, if any.
export async function removeMarketReport(projectId: string, reportId: string): Promise<ReportResult> {
  const role = await requireStaff();
  if (role !== "admin") return { error: "Only an admin can remove a published Market Report." };
  const project = z.uuid().safeParse(projectId);
  const id = z.uuid().safeParse(reportId);
  if (!project.success || !id.success) return { error: NOT_FOUND };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("client_market_reports")
    .delete()
    .eq("id", id.data)
    .eq("forwarder_project_id", project.data)
    .select("id");
  if (error || !data?.length) {
    if (error) console.error("market report delete failed:", error.code);
    return { error: "The report couldn't be removed." };
  }
  revalidatePath(marketReportPath(project.data));
  return { ok: "Report removed. The client now sees the previous one, if there is one." };
}

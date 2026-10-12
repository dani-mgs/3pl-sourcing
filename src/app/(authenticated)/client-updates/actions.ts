"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaff } from "@/lib/auth/require-staff";
import { getOwnershipContext } from "@/lib/auth/get-ownership-context";
import { createClient } from "@/lib/supabase/server";
import { buildForwarderPayload } from "@/lib/client-updates/build-forwarder-payload";
import { buildThreePlPayload } from "@/lib/client-updates/build-three-pl-payload";
import { utcToday } from "@/lib/client-updates/dates";
import { loadFirstNames, loadForwarderSource, loadThreePlSource, type ProjectMeta } from "@/lib/client-updates/load-publish-source";
import type { BuildResult, People } from "@/lib/client-updates/build-common";
import { publishHash } from "@/lib/client-updates/publish-hash";
import { parsePublishForm, type PublishInputs } from "@/lib/client-updates/publish-inputs";
import type { ClientUpdateView } from "@/lib/client-updates/portal-text";
import type { ClientUpdatePayload } from "@/lib/client-updates/payload-schema";
import { sharePath, type ShareKind } from "@/lib/client-updates/share-paths";

// "Share update with client": preview, save a draft, publish, discard a
// draft, and (admins) remove a published update. The browser sends only the
// form; the payload is always rebuilt here from live data, and Publish
// refuses unless it matches what the expert previewed. RLS limits writes to
// the project owner or an admin; the checks here give a clear message first.

type Fail = { error: string };
export type PreviewResult = { view: ClientUpdateView; hash: string } | Fail;
export type ShareResult = { ok: string } | Fail;

const targetSchema = z.object({ kind: z.enum(["forwarder", "three_pl"]), projectId: z.uuid() });

const NOT_ALLOWED = "Only the project's owner or an admin can share updates with its client.";
const NOT_FOUND = "This project couldn't be found.";
const SAVE_FAILED = "The update couldn't be saved. Try again.";

type Prepared = {
  kind: ShareKind;
  projectId: string;
  clientName: string;
  inputs: PublishInputs;
  fields: {
    stage: number;
    headline: string;
    summary: string;
    next_step: string | null;
    next_step_due: string | null;
    needs_client_action: boolean;
  };
  payload: ClientUpdatePayload;
  hash: string;
};

async function prepare(kind: unknown, projectId: unknown, formData: FormData): Promise<Prepared | Fail> {
  const target = targetSchema.safeParse({ kind, projectId });
  if (!target.success) return { error: NOT_FOUND };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NOT_ALLOWED };

  const t = target.data;
  const parsed = parsePublishForm(formData);
  const today = utcToday();
  let meta: ProjectMeta;
  let build: (inputs: PublishInputs, people: People) => BuildResult<ClientUpdatePayload>;
  if (t.kind === "forwarder") {
    const loaded = await loadForwarderSource(supabase, t.projectId);
    if (!loaded) return { error: NOT_FOUND };
    meta = loaded.meta;
    build = (inputs, people) => buildForwarderPayload(loaded.source, inputs, people, today);
  } else {
    const loaded = await loadThreePlSource(supabase, t.projectId);
    if (!loaded) return { error: NOT_FOUND };
    meta = loaded.meta;
    build = (inputs, people) => buildThreePlPayload(loaded.source, inputs, people);
  }
  const { canWrite } = await getOwnershipContext(t.projectId, t.kind === "forwarder" ? "forwarder_projects" : "three_pl_projects");
  if (!canWrite) return { error: NOT_ALLOWED };
  if (!parsed.ok) return { error: parsed.error };
  const inputs = parsed.data;

  const names = await loadFirstNames(supabase, [user.id, meta.ownerId]);
  const built = build(inputs, {
    authorFirstName: names.get(user.id) ?? null,
    ownerFirstName: names.get(meta.ownerId) ?? null,
  });
  if (!built.ok) return { error: built.error };

  const fields = {
    stage: inputs.stage,
    headline: inputs.headline,
    summary: inputs.summary,
    next_step: inputs.nextStep,
    next_step_due: inputs.nextStepDue,
    needs_client_action: inputs.needsClientAction,
  };
  return {
    kind: t.kind,
    projectId: t.projectId,
    clientName: meta.clientName,
    inputs,
    fields,
    payload: built.payload,
    hash: publishHash({ fields, payload: built.payload }),
  };
}

function projectColumn(kind: ShareKind) {
  return kind === "forwarder" ? "forwarder_project_id" : "three_pl_project_id";
}

// Writes the prepared content into the project's one draft (creating it if
// needed) and its inputs. Returns the draft's id.
async function writeDraft(p: Prepared): Promise<string | null> {
  const supabase = await createClient();
  const column = projectColumn(p.kind);
  const { data: existing } = await supabase
    .from("client_updates")
    .select("id")
    .eq(column, p.projectId)
    .eq("is_draft", true)
    .maybeSingle();

  let id = existing?.id as string | undefined;
  if (id) {
    const { error } = await supabase.from("client_updates").update({ ...p.fields, payload: p.payload }).eq("id", id);
    if (error) {
      console.error("client update draft update failed:", error.code);
      return null;
    }
  } else {
    const { data, error } = await supabase
      .from("client_updates")
      // client_id comes from the project (a database trigger sets it).
      .insert({ ...p.fields, payload: p.payload, [column]: p.projectId, is_draft: true })
      .select("id")
      .single();
    if (error || !data) {
      console.error("client update draft insert failed:", error?.code);
      return null;
    }
    id = data.id as string;
  }

  const { error: inputsError } = await supabase
    .from("client_update_inputs")
    .upsert({ client_update_id: id, inputs: p.inputs }, { onConflict: "client_update_id" });
  if (inputsError) {
    console.error("client update inputs save failed:", inputsError.code);
    return null;
  }
  return id;
}

export async function previewClientUpdate(kind: ShareKind, projectId: string, formData: FormData): Promise<PreviewResult> {
  await requireStaff();
  const prepared = await prepare(kind, projectId, formData);
  if ("error" in prepared) return prepared;
  return {
    view: {
      stage: prepared.fields.stage,
      headline: prepared.fields.headline,
      summary: prepared.fields.summary,
      nextStep: prepared.fields.next_step,
      nextStepDue: prepared.fields.next_step_due,
      needsClientAction: prepared.fields.needs_client_action,
      publishedAt: null,
      payload: prepared.payload,
    },
    hash: prepared.hash,
  };
}

export async function saveClientUpdateDraft(kind: ShareKind, projectId: string, formData: FormData): Promise<ShareResult> {
  await requireStaff();
  const prepared = await prepare(kind, projectId, formData);
  if ("error" in prepared) return prepared;
  const id = await writeDraft(prepared);
  if (!id) return { error: SAVE_FAILED };
  revalidatePath(sharePath(prepared.kind, prepared.projectId));
  return { ok: "Draft saved. The client can't see drafts." };
}

export async function publishClientUpdate(
  kind: ShareKind,
  projectId: string,
  previewHash: string,
  formData: FormData,
): Promise<ShareResult> {
  await requireStaff();
  const prepared = await prepare(kind, projectId, formData);
  if ("error" in prepared) return prepared;
  if (typeof previewHash !== "string" || previewHash !== prepared.hash) {
    return { error: "The update has changed since your preview (the form or the project's figures). Preview it again, then publish." };
  }
  const id = await writeDraft(prepared);
  if (!id) return { error: SAVE_FAILED };
  const supabase = await createClient();
  const { error } = await supabase.from("client_updates").update({ is_draft: false }).eq("id", id).eq("is_draft", true);
  if (error) {
    console.error("client update publish failed:", error.code);
    return { error: "The update was saved as a draft but couldn't be published. Try again." };
  }
  revalidatePath(sharePath(prepared.kind, prepared.projectId));
  return { ok: `Published for ${prepared.clientName}.` };
}

export async function discardClientUpdateDraft(kind: ShareKind, projectId: string): Promise<ShareResult> {
  await requireStaff();
  const target = targetSchema.safeParse({ kind, projectId });
  if (!target.success) return { error: NOT_FOUND };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("client_updates")
    .delete()
    .eq(projectColumn(target.data.kind), target.data.projectId)
    .eq("is_draft", true)
    .select("id");
  if (error) {
    console.error("client update draft delete failed:", error.code);
    return { error: "The draft couldn't be discarded. Try again." };
  }
  if (!data?.length) return { error: NOT_ALLOWED };
  revalidatePath(sharePath(target.data.kind, target.data.projectId));
  return { ok: "Draft discarded." };
}

// Admins only: remove a published update that was a mistake. (RLS also lets
// only admins delete a published update.)
export async function removePublishedClientUpdate(kind: ShareKind, projectId: string, updateId: string): Promise<ShareResult> {
  const role = await requireStaff();
  if (role !== "admin") return { error: "Only an admin can remove a published update." };
  const target = targetSchema.safeParse({ kind, projectId });
  const id = z.uuid().safeParse(updateId);
  if (!target.success || !id.success) return { error: NOT_FOUND };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("client_updates")
    .delete()
    .eq("id", id.data)
    .eq(projectColumn(target.data.kind), target.data.projectId)
    .eq("is_draft", false)
    .select("id");
  if (error || !data?.length) {
    if (error) console.error("client update delete failed:", error.code);
    return { error: "The update couldn't be removed." };
  }
  revalidatePath(sharePath(target.data.kind, target.data.projectId));
  return { ok: "Update removed. The client no longer sees it." };
}

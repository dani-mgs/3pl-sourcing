"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { todayUtc } from "@/lib/fx/server-rates";
import { parseEstimateForm, parseLinkFields, type EstimateFormData } from "@/lib/tariff/parse-estimate-form";
import { saveDutyEstimate } from "@/lib/tariff/estimate-store";
import { buildEstimate, estimateToRow, type EstimateResult } from "@/lib/tariff/server-estimate";
import { checkLinkedEstimate, type CheckedLink } from "@/lib/tariff/server-forwarder-link";

export type PreviewState = { result?: EstimateResult; error?: string };
export type SaveState = { error?: string };

const SIGN_IN = "Your session has expired. Sign in again.";
const UNEXPECTED = "An unexpected error occurred.";

type Supabase = Awaited<ReturnType<typeof createClient>>;

// Parses the form and, for an estimate opened from a forwarder project or
// quote, runs the linked checks (owner/admin, unchanged sources, every input
// confirmed). Unlinked estimates take exactly the original path.
async function parseRequest(
  supabase: Supabase,
  formData: FormData,
  calculatedOn: string,
): Promise<{ ok: true; input: EstimateFormData; link: Extract<CheckedLink, { ok: true }> | null } | { ok: false; error: string }> {
  const parsed = parseEstimateForm(formData, calculatedOn);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const link = parseLinkFields(formData);
  if ("error" in link) return { ok: false, error: link.error };
  if (!link.linked) return { ok: true, input: parsed.data, link: null };

  try {
    const checked = await checkLinkedEstimate(supabase, parsed.data, link.data, calculatedOn);
    if (!checked.ok) return { ok: false, error: checked.error };
    return { ok: true, input: checked.input, link: checked };
  } catch (error) {
    console.error("checkLinkedEstimate error:", error);
    return { ok: false, error: UNEXPECTED };
  }
}

// Calculates without saving. Any signed-in user may estimate; reads only.
export async function previewEstimate(formData: FormData): Promise<PreviewState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: SIGN_IN };

  // One "today" per request, for the entry-date bounds and the calculation.
  const calculatedOn = todayUtc();
  const request = await parseRequest(supabase, formData, calculatedOn);
  if (!request.ok) return { error: request.error };

  const built = await buildEstimate(supabase, request.input, calculatedOn);
  return built.ok ? { result: built.estimate } : { error: built.error };
}

// Recalculates on the server (never trusting the preview) and saves a locked
// estimate owned by the signed-in user. A linked estimate also stores its
// project/quote and a snapshot of their values, read from the database here.
// Flagged for rate-limiting review with the other inserting actions
// (docs/SECURITY.md).
export async function saveEstimate(formData: FormData): Promise<SaveState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: SIGN_IN };

  const calculatedOn = todayUtc();
  const request = await parseRequest(supabase, formData, calculatedOn);
  if (!request.ok) return { error: request.error };

  const built = await buildEstimate(supabase, request.input, calculatedOn);
  if (!built.ok) return { error: built.error };

  // The user and link checks above have passed; the insert itself goes
  // through save_duty_estimate (the service role's only use here), which
  // stamps created_by from this user and re-checks the row.
  const saved = await saveDutyEstimate(user.id, {
    ...estimateToRow(built.estimate, request.input.label),
    ...(request.link?.row ?? {}),
  });
  if (!saved.ok) return { error: saved.error };

  revalidatePath("/tariff-calculator");
  if (request.link) {
    const { project, quote } = request.link.sources;
    revalidatePath(`/forwarder-sourcing/${project.id}`);
    if (quote) revalidatePath(`/forwarder-sourcing/${project.id}/forwarders/${quote.forwarder_id}`);
  }
  redirect(`/tariff-calculator/estimates/${saved.id}`);
}

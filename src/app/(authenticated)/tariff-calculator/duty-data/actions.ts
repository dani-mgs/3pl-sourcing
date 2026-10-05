"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getTariffPermissions } from "@/lib/auth/get-tariff-permissions";
import {
  parseDutyDetails,
  parseEndDate,
  parseMarkReviewed,
  parseNewDuty,
  parseNewFee,
} from "@/lib/tariff/parse-duty-data-forms";

// Duty and fee data maintenance, for tariff editors and admins. Each action
// checks the permission here (getUser via getTariffPermissions) and RLS
// (is_tariff_editor()) enforces it again. Flagged for rate-limiting review
// with the other mutating actions (docs/SECURITY.md).

export type DutyDataActionState = { error?: string; success?: string };

const NO_PERMISSION = "You don't have permission to edit duty data.";
const UNEXPECTED = "An unexpected error occurred.";

type DbError = { code?: string } | null;

// Database refusals that mean something to an editor.
function friendly(error: DbError, context: string): string {
  console.error(`${context} error:`, error);
  if (error?.code === "23P01") {
    return "That overlaps a row already in force for the same heading or fee. End-date the current row first, then add the new one from the next day.";
  }
  if (error?.code === "42501") return NO_PERMISSION;
  if (error?.code === "23514") return "The database refused that combination of values. Check the rate type, rate and headings.";
  return UNEXPECTED;
}

async function editorClient() {
  const permissions = await getTariffPermissions();
  if (!permissions.canEditTariffData) return null;
  return createClient();
}

function refresh(programKey?: string) {
  revalidatePath("/tariff-calculator/duty-data");
  if (programKey) revalidatePath(`/tariff-calculator/duty-data/${programKey}`);
  revalidatePath("/tariff-calculator");
}

// Records that the program's rows were checked against their sources, without
// changing any rate. Any later change puts it back to pending review.
export async function markProgramReviewed(formData: FormData): Promise<DutyDataActionState> {
  const supabase = await editorClient();
  if (!supabase) return { error: NO_PERMISSION };
  const parsed = parseMarkReviewed(formData);
  if (!parsed.ok) return { error: parsed.error };

  const { data: release } = await supabase
    .from("hts_releases")
    .select("name, chapter99_digest")
    .eq("status", "current")
    .maybeSingle();

  const { error } = await supabase.from("duty_program_reviews").insert({
    program_key: parsed.data.programKey,
    note: parsed.data.note,
    hts_release_name: release?.name ?? null,
    chapter99_digest: release?.chapter99_digest ?? null,
  });
  if (error) return { error: friendly(error, "markProgramReviewed") };

  refresh(parsed.data.programKey);
  return { success: "Marked reviewed." };
}

export async function endDateDuty(formData: FormData): Promise<DutyDataActionState> {
  const supabase = await editorClient();
  if (!supabase) return { error: NO_PERMISSION };
  const parsed = parseEndDate(formData);
  if (!parsed.ok) return { error: parsed.error };

  const { data, error } = await supabase
    .from("additional_duties")
    .update({ effective_to: parsed.data.effectiveTo })
    .eq("id", parsed.data.id)
    .select("program_key, effective_from");
  if (error) return { error: friendly(error, "endDateDuty") };
  if (!data || data.length === 0) return { error: NO_PERMISSION };

  refresh(data[0].program_key as string);
  return { success: "End date saved. The program is pending review again." };
}

export async function updateDutyDetails(formData: FormData): Promise<DutyDataActionState> {
  const supabase = await editorClient();
  if (!supabase) return { error: NO_PERMISSION };
  const parsed = parseDutyDetails(formData);
  if (!parsed.ok) return { error: parsed.error };
  const d = parsed.data;

  const { data, error } = await supabase
    .from("additional_duties")
    .update({
      label: d.label,
      legal_status: d.legalStatus,
      notes: d.notes,
      source_label: d.sourceLabel,
      source_url: d.sourceUrl,
      source_checked_on: d.sourceCheckedOn,
      source_document_url: d.sourceDocumentUrl,
      source_document_label: d.sourceDocumentLabel,
      ...(d.assumeCondition === undefined ? {} : { assume_condition: d.assumeCondition }),
    })
    .eq("id", d.id)
    .select("program_key");
  if (error) return { error: friendly(error, "updateDutyDetails") };
  if (!data || data.length === 0) return { error: NO_PERMISSION };

  const key = data[0].program_key as string;
  refresh(key);
  // A source-only edit keeps the program's review (duty_program_review_status).
  const { data: status } = await supabase
    .from("duty_program_review_status")
    .select("review_status")
    .eq("program_key", key)
    .maybeSingle();
  return {
    success:
      status?.review_status === "reviewed"
        ? "Saved. Only the source changed, so the program stays reviewed."
        : "Saved. The program is pending review until someone reviews it again.",
  };
}

export async function addDuty(formData: FormData): Promise<DutyDataActionState> {
  const supabase = await editorClient();
  if (!supabase) return { error: NO_PERMISSION };
  const parsed = parseNewDuty(formData);
  if (!parsed.ok) return { error: parsed.error };
  const d = parsed.data;

  const { data, error } = await supabase
    .from("additional_duties")
    .insert({
      program_key: d.programKey,
      authority: d.authority,
      chapter99_heading: d.chapter99Heading,
      chapter99_heading_at_minimum: d.chapter99HeadingAtMinimum,
      label: d.label,
      rate_type: d.rateType,
      rate_pct: d.ratePct,
      origin_countries: d.originCountries,
      hts_scope: d.scope.length > 0 ? "listed" : "all",
      condition_text: d.conditionText,
      assume_condition: d.assumeCondition,
      excludes_programs: d.excludesPrograms,
      exclusion_heading: d.exclusionHeading,
      effective_from: d.effectiveFrom,
      effective_to: d.effectiveTo,
      legal_status: d.legalStatus,
      source_label: d.sourceLabel,
      source_url: d.sourceUrl,
      source_checked_on: d.sourceCheckedOn,
      source_document_url: d.sourceDocumentUrl,
      source_document_label: d.sourceDocumentLabel,
      notes: d.notes,
    })
    .select("id")
    .single();
  if (error || !data) return { error: friendly(error, "addDuty") };

  if (d.scope.length > 0) {
    const { error: scopeError } = await supabase.from("additional_duty_scope").insert(
      d.scope.map((s) => ({ duty_id: data.id, hts_prefix: s.prefix, article_description: s.description, excluded: s.excluded })),
    );
    if (scopeError) {
      // Don't leave a row limited to a scope it doesn't have.
      await supabase.from("additional_duties").delete().eq("id", data.id);
      return { error: friendly(scopeError, "addDuty scope") };
    }
  }

  refresh(d.programKey);
  return { success: "Row added. The program is pending review until marked reviewed." };
}

export async function endDateFee(formData: FormData): Promise<DutyDataActionState> {
  const supabase = await editorClient();
  if (!supabase) return { error: NO_PERMISSION };
  const parsed = parseEndDate(formData);
  if (!parsed.ok) return { error: parsed.error };

  const { data, error } = await supabase
    .from("customs_fees")
    .update({ effective_to: parsed.data.effectiveTo })
    .eq("id", parsed.data.id)
    .select("id");
  if (error) return { error: friendly(error, "endDateFee") };
  if (!data || data.length === 0) return { error: NO_PERMISSION };

  refresh();
  revalidatePath("/tariff-calculator/duty-data/fees");
  return { success: "End date saved." };
}

export async function addFee(formData: FormData): Promise<DutyDataActionState> {
  const supabase = await editorClient();
  if (!supabase) return { error: NO_PERMISSION };
  const parsed = parseNewFee(formData);
  if (!parsed.ok) return { error: parsed.error };
  const f = parsed.data;

  const { error } = await supabase.from("customs_fees").insert({
    fee_code: f.feeCode,
    label: f.label,
    rate_pct: f.ratePct,
    min_usd: f.minUsd,
    max_usd: f.maxUsd,
    flat_usd: f.flatUsd,
    applies_up_to_value_usd: f.appliesUpToValueUsd,
    effective_from: f.effectiveFrom,
    source_label: f.sourceLabel,
    source_url: f.sourceUrl,
    notes: f.notes,
  });
  if (error) return { error: friendly(error, "addFee") };

  refresh();
  revalidatePath("/tariff-calculator/duty-data/fees");
  return { success: "Fee row added." };
}

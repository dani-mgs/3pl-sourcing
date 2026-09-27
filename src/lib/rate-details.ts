import type { SupabaseClient } from "@supabase/supabase-js";

// rate_details is a 1:1 companion table to three_pl_providers. Its fields
// are edited as part of the shared 3PL form and saved by the same Server
// Actions, right after the three_pl_providers write.
export const RATE_FIELDS = [
  { name: "receiving_rate", label: "Receiving Rate" },
  { name: "storage_rate", label: "Storage Rate" },
  { name: "fulfillment_rate", label: "Fulfillment Rate" },
  { name: "dispatch_rate", label: "Dispatch Rate" },
  { name: "adhoc_kitting_rate", label: "Adhoc Kitting/Bundling Rate" },
  { name: "adhoc_labelling_rate", label: "Adhoc Labelling Rate" },
  { name: "returns_rate", label: "Returns Rate" },
  { name: "annual_inv_count_rate", label: "Annual Inventory Count Rate" },
  { name: "cycle_count_rate", label: "Cycle Count Rate" },
  {
    name: "inv_count_on_request_rate",
    label: "Inventory Count on Request Rate",
  },
  { name: "setup_rate", label: "One-Time Setup Rate" },
  { name: "onboarding_fee", label: "Onboarding Fee" },
  { name: "security_deposit", label: "Security Deposit" },
] as const;

export type RateField = (typeof RATE_FIELDS)[number]["name"];

export type RateDetails = Record<RateField, number | null>;

export const RATE_SELECT =
  "receiving_rate, storage_rate, fulfillment_rate, dispatch_rate, adhoc_kitting_rate, adhoc_labelling_rate, returns_rate, annual_inv_count_rate, cycle_count_rate, inv_count_on_request_rate, setup_rate, onboarding_fee, security_deposit";

export const BLANK_RATE_DETAILS: RateDetails = Object.fromEntries(
  RATE_FIELDS.map((field) => [field.name, null]),
) as RateDetails;

export const RATE_DETAILS_NOT_SAVED_ERROR =
  "The 3PL was saved, but its rate details weren't. Your entries are still below — try saving again.";

export function rateDetailsFromForm(formData: FormData): RateDetails {
  const rates = { ...BLANK_RATE_DETAILS };
  for (const field of RATE_FIELDS) {
    const value = formData.get(field.name) as string | null;
    if (!value) continue;
    const parsed = Number(value);
    rates[field.name] = Number.isNaN(parsed) ? null : parsed;
  }
  return rates;
}

function hasAnyRate(rates: RateDetails): boolean {
  return RATE_FIELDS.some((field) => rates[field.name] != null);
}

// "create" (a brand-new 3PL): only inserts a row if at least one rate has a
// value, so blank forms never leave empty rate_details rows behind.
// "update" (an existing 3PL): upserts when any rate has a value; when every
// rate is cleared, nulls out an existing row rather than deleting it, and
// still creates nothing if no row exists yet.
// Returns false on any failure, including an RLS rejection (zero rows back).
export async function saveRateDetails(
  supabase: SupabaseClient,
  providerId: string,
  rates: RateDetails,
  mode: "create" | "update",
): Promise<boolean> {
  const payload = {
    provider_id: providerId,
    ...rates,
    updated_at: new Date().toISOString(),
  };

  if (!hasAnyRate(rates)) {
    if (mode === "create") return true;

    const { data: existing, error: lookupError } = await supabase
      .from("rate_details")
      .select("id")
      .eq("provider_id", providerId)
      .maybeSingle();
    if (lookupError) {
      console.error("saveRateDetails lookup error:", lookupError);
      return false;
    }
    if (!existing) return true;

    const { data, error } = await supabase
      .from("rate_details")
      .update(payload)
      .eq("provider_id", providerId)
      .select("id");
    if (error) {
      console.error("saveRateDetails clear error:", error);
      return false;
    }
    return Boolean(data && data.length > 0);
  }

  const { data, error } =
    mode === "create"
      ? await supabase.from("rate_details").insert(payload).select("id")
      : await supabase
          .from("rate_details")
          .upsert(payload, { onConflict: "provider_id" })
          .select("id");
  if (error) {
    console.error("saveRateDetails write error:", error);
    return false;
  }
  return Boolean(data && data.length > 0);
}

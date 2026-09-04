import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EditProviderForm } from "./edit-provider-form";
import type { ProviderFormDefaults } from "../../provider-form";

export default async function EditProviderPage({
  params,
}: PageProps<"/projects/[id]/providers/[providerId]/edit">) {
  const { id, providerId } = await params;

  const supabase = await createClient();

  const { data: provider } = await supabase
    .from("three_pl_providers")
    .select(
      "id, company_name, provider_type, website, location, footprint_source, contact_person, email, phone, receiving, storage, fulfillment, dispatch, adhoc_kitting_bundling, adhoc_labelling, returns, annual_inventory_count, cycle_count, inventory_count_on_request, one_time_system_setup, lot_batch_expiry_tracking, temp_controlled_storage, retail_edi_compliance, cross_docking, onboarding_period_months, virtual_tour_url, billing_terms, other_specialization, b2b, b2c, is_incumbent, storage_cost, pick_pack_cost, receiving_cost, returns_cost, status, key_strength, key_weakness_risk, important_assumption, overall_assessment, client_decision, source_basis, next_action, key_notes, notes",
    )
    .eq("id", providerId)
    .eq("client_requirement_id", id)
    .single();

  if (!provider) {
    notFound();
  }

  return (
    <div className="max-w-5xl px-8 py-10">
      <Link
        href={`/projects/${id}/providers/${providerId}`}
        className="text-sm font-medium text-move-green hover:underline"
      >
        ← Back to {provider.company_name}
      </Link>

      <h1 className="mt-2 mb-8 font-display text-2xl font-semibold text-move-navy">
        Edit Provider
      </h1>

      <div className="rounded-2xl border border-neutral-border bg-white p-6 shadow-sm">
        <EditProviderForm
          clientRequirementId={id}
          providerId={providerId}
          defaultValues={provider as ProviderFormDefaults}
        />
      </div>
    </div>
  );
}

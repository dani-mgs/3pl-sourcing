import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOwnershipContext } from "@/lib/auth/get-ownership-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  StatusBadge,
  AssessmentBadge,
  type ProviderStatus,
  type AssessmentStatus,
} from "../status-badge";
import { DeleteProviderButton } from "./delete-provider-button";

const USD_FORMATTER = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const CAPABILITY_FIELDS: { key: string; label: string }[] = [
  { key: "receiving", label: "Receiving" },
  { key: "storage", label: "Storage" },
  { key: "fulfillment", label: "Fulfillment" },
  { key: "dispatch", label: "Dispatch" },
  { key: "adhoc_kitting_bundling", label: "Ad-hoc Kitting/Bundling" },
  { key: "adhoc_labelling", label: "Ad-hoc Labelling" },
  { key: "returns", label: "Returns" },
  { key: "annual_inventory_count", label: "Annual Inventory Count" },
  { key: "cycle_count", label: "Cycle Count" },
  { key: "inventory_count_on_request", label: "Inventory Count on Request" },
  { key: "one_time_system_setup", label: "One-Time System Setup" },
  { key: "lot_batch_expiry_tracking", label: "Lot/Batch Expiry Tracking" },
  { key: "temp_controlled_storage", label: "Temp-Controlled Storage" },
  { key: "retail_edi_compliance", label: "Retail EDI Compliance" },
  { key: "cross_docking", label: "Cross Docking" },
  { key: "b2b", label: "B2B" },
  { key: "b2c", label: "B2C" },
];

function InfoField({
  label,
  value,
}: {
  label: string;
  value: string | number | null | undefined;
}) {
  return (
    <div>
      <dt className="text-xs text-neutral-muted">{label}</dt>
      <dd className="text-sm text-move-navy">{value || "—"}</dd>
    </div>
  );
}

export default async function ProviderDetailsPage({
  params,
}: PageProps<"/projects/[id]/providers/[providerId]">) {
  const { id, providerId } = await params;

  const supabase = await createClient();

  const { data: provider } = await supabase
    .from("three_pl_providers")
    .select(
      "id, company_name, provider_type, website, location, footprint_source, contact_person, email, phone, receiving, storage, fulfillment, dispatch, adhoc_kitting_bundling, adhoc_labelling, returns, annual_inventory_count, cycle_count, inventory_count_on_request, one_time_system_setup, lot_batch_expiry_tracking, temp_controlled_storage, retail_edi_compliance, cross_docking, onboarding_period_months, virtual_tour_url, billing_terms, other_specialization, b2b, b2c, is_incumbent, storage_cost, pick_pack_cost, receiving_cost, returns_cost, status, assessment_status, key_strength, key_weakness_risk, important_assumption, overall_assessment, client_decision, source_basis, next_action, key_notes, notes, updated_at",
    )
    .eq("id", providerId)
    .eq("client_requirement_id", id)
    .single();

  if (!provider) {
    notFound();
  }

  const { canWrite } = await getOwnershipContext(id);

  const totalCost =
    (provider.storage_cost ?? 0) +
    (provider.pick_pack_cost ?? 0) +
    (provider.receiving_cost ?? 0) +
    (provider.returns_cost ?? 0);

  return (
    <div className="max-w-5xl px-8 py-10">
      <Link
        href={`/projects/${id}/providers`}
        className="text-sm font-medium text-move-green hover:underline"
      >
        ← Back to 3PL List
      </Link>

      <div className="mt-2 mb-2 flex items-center gap-3">
        <h1 className="font-display text-2xl font-semibold text-move-navy">
          {provider.company_name}
        </h1>
        <StatusBadge status={provider.status as ProviderStatus} />
        {provider.assessment_status && (
          <AssessmentBadge
            status={provider.assessment_status as AssessmentStatus}
          />
        )}
        {provider.is_incumbent && (
          <Badge variant="outline" className="border-transparent bg-[#E3F2FD] text-[#1565C0]">
            Incumbent
          </Badge>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href={`/projects/${id}/providers/${providerId}/rates`} />}
          >
            Rate Details
          </Button>
          {canWrite && (
            <>
              <Button
                variant="outline"
                nativeButton={false}
                render={<Link href={`/projects/${id}/providers/${providerId}/edit`} />}
              >
                Edit
              </Button>
              <DeleteProviderButton
                projectId={id}
                providerId={providerId}
                companyName={provider.company_name}
              />
            </>
          )}
        </div>
      </div>
      <p className="mb-8 text-xs text-neutral-muted">
        Last updated {new Date(provider.updated_at).toLocaleDateString()}
      </p>

      <div className="flex flex-col gap-6">
        <section className="rounded-2xl border border-neutral-border bg-white p-6 shadow-sm">
          <h2 className="mb-4 font-display text-lg font-semibold text-move-navy">
            Company Info
          </h2>
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <InfoField label="Provider Type" value={provider.provider_type} />
            <InfoField label="Website" value={provider.website} />
            <InfoField label="Location" value={provider.location} />
            <InfoField
              label="Footprint Source"
              value={provider.footprint_source}
            />
            <InfoField
              label="Contact Person"
              value={provider.contact_person}
            />
            <InfoField label="Email" value={provider.email} />
            <InfoField label="Phone" value={provider.phone} />
          </dl>
        </section>

        <section className="rounded-2xl border border-neutral-border bg-white p-6 shadow-sm">
          <h2 className="mb-4 font-display text-lg font-semibold text-move-navy">
            Capabilities
          </h2>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
            {CAPABILITY_FIELDS.map((capability) => {
              const enabled = Boolean(
                provider[capability.key as keyof typeof provider],
              );
              return (
                <li
                  key={capability.key}
                  className="flex items-center gap-2 text-sm"
                >
                  <span
                    className={
                      enabled
                        ? "text-move-green"
                        : "text-neutral-muted"
                    }
                  >
                    {enabled ? "✓" : "—"}
                  </span>
                  <span className={enabled ? "text-move-navy" : "text-neutral-muted"}>
                    {capability.label}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="rounded-2xl border border-neutral-border bg-white p-6 shadow-sm">
          <h2 className="mb-4 font-display text-lg font-semibold text-move-navy">
            Commercial Terms
          </h2>
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <InfoField
              label="Onboarding Period"
              value={
                provider.onboarding_period_months
                  ? `${provider.onboarding_period_months} months`
                  : null
              }
            />
            <InfoField
              label="Virtual Tour URL"
              value={provider.virtual_tour_url}
            />
            <InfoField label="Billing Terms" value={provider.billing_terms} />
            <InfoField
              label="Other Specialization"
              value={provider.other_specialization}
            />
          </dl>
        </section>

        <section className="rounded-2xl border border-neutral-border bg-white p-6 shadow-sm">
          <h2 className="mb-4 font-display text-lg font-semibold text-move-navy">
            Costs (USD)
          </h2>
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <InfoField
              label="Storage Cost"
              value={
                provider.storage_cost != null
                  ? USD_FORMATTER.format(provider.storage_cost)
                  : null
              }
            />
            <InfoField
              label="Pick & Pack Cost"
              value={
                provider.pick_pack_cost != null
                  ? USD_FORMATTER.format(provider.pick_pack_cost)
                  : null
              }
            />
            <InfoField
              label="Receiving Cost"
              value={
                provider.receiving_cost != null
                  ? USD_FORMATTER.format(provider.receiving_cost)
                  : null
              }
            />
            <InfoField
              label="Returns Cost"
              value={
                provider.returns_cost != null
                  ? USD_FORMATTER.format(provider.returns_cost)
                  : null
              }
            />
          </dl>
          <div className="mt-4 border-t border-neutral-border pt-4">
            <InfoField
              label="Total Cost"
              value={USD_FORMATTER.format(totalCost)}
            />
          </div>
        </section>

        <section className="rounded-2xl border border-neutral-border bg-white p-6 shadow-sm">
          <h2 className="mb-4 font-display text-lg font-semibold text-move-navy">
            Status &amp; Assessment
          </h2>
          <dl className="grid grid-cols-1 gap-4">
            <InfoField label="Key Strength" value={provider.key_strength} />
            <InfoField
              label="Key Weakness / Risk"
              value={provider.key_weakness_risk}
            />
            <InfoField
              label="Important Assumption"
              value={provider.important_assumption}
            />
            <InfoField
              label="Overall Assessment"
              value={provider.overall_assessment}
            />
            <InfoField
              label="Client Decision"
              value={provider.client_decision}
            />
            <InfoField label="Source / Basis" value={provider.source_basis} />
            <InfoField label="Next Action" value={provider.next_action} />
            <InfoField label="Key Notes" value={provider.key_notes} />
            <InfoField label="Notes" value={provider.notes} />
          </dl>
        </section>
      </div>
    </div>
  );
}

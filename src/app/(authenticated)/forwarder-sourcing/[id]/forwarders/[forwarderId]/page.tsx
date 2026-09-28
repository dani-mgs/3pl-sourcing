import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOwnershipContext } from "@/lib/auth/get-ownership-context";
import { ViewOnlyBanner } from "@/components/view-only-banner";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/section-card";
import { ToggleChipDisplay } from "@/components/toggle-chip-display";
import { CAPABILITY_FIELDS } from "@/lib/forwarder/forwarder-fields";
import {
  FORWARDER_FIELDS_SELECT,
  type ForwarderFields,
} from "@/lib/forwarder/parse-forwarder-form";
import {
  ForwarderAssessmentBadge,
  ForwarderStatusBadge,
} from "../../forwarder-status-badge";
import type {
  ForwarderAssessment,
  ForwarderStatus,
} from "@/lib/forwarder/forwarder-fields";

function InfoField({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div>
      <dt className="text-xs text-neutral-muted">{label}</dt>
      <dd className="text-sm whitespace-pre-line text-move-navy">{value || "—"}</dd>
    </div>
  );
}

export default async function ForwarderDetailPage({
  params,
}: PageProps<"/forwarder-sourcing/[id]/forwarders/[forwarderId]">) {
  const { id, forwarderId } = await params;

  const supabase = await createClient();
  const { data: forwarder } = await supabase
    .from("forwarders")
    .select(`id, updated_at, ${FORWARDER_FIELDS_SELECT}`)
    .eq("id", forwarderId)
    .eq("forwarder_project_id", id)
    .single();

  if (!forwarder) {
    notFound();
  }
  // The select string above is built at runtime, so Supabase can't infer its
  // columns from the literal type; the Zod-derived type is the real contract
  // here (see FORWARDER_FIELDS_SELECT).
  const fields = forwarder as unknown as ForwarderFields & {
    id: string;
    updated_at: string;
  };

  const { canWrite } = await getOwnershipContext(id, "forwarder_projects");

  return (
    <div className="mx-auto max-w-4xl px-8 py-10">
      <div className="mb-2 text-xs text-neutral-muted">
        <Link href="/forwarder-sourcing" className="hover:underline">
          Forwarder Sourcing
        </Link>
        <span className="mx-1.5">/</span>
        <Link href={`/forwarder-sourcing/${id}`} className="hover:underline">
          Project
        </Link>
        <span className="mx-1.5">/</span>
        <span>{fields.company_name}</span>
      </div>

      <div className="mt-2 mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-2xl font-semibold text-move-navy">
            {fields.company_name}
          </h1>
          <ForwarderStatusBadge status={fields.status as ForwarderStatus} />
          {fields.assessment && (
            <ForwarderAssessmentBadge
              assessment={fields.assessment as ForwarderAssessment}
            />
          )}
        </div>
        {canWrite && (
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href={`/forwarder-sourcing/${id}/forwarders/${forwarderId}/edit`} />}
          >
            Edit
          </Button>
        )}
      </div>
      <p className="-mt-4 mb-6 text-xs text-neutral-muted">
        Last updated {new Date(fields.updated_at).toLocaleDateString()}
      </p>

      <ViewOnlyBanner
        clientRequirementId={id}
        canWrite={canWrite}
        table="forwarder_projects"
      />

      <div className="flex flex-col gap-6">
        <SectionCard title="Company Info">
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <InfoField label="Website" value={fields.website} />
            <InfoField label="Headquarters" value={fields.headquarters} />
            <InfoField label="Footprint" value={fields.footprint} />
          </dl>
        </SectionCard>

        <SectionCard title="Contact">
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <InfoField label="Contact Person" value={fields.contact_person} />
            <InfoField label="Contact Position" value={fields.contact_position} />
            <InfoField label="Email" value={fields.email} />
            <InfoField label="Phone" value={fields.phone} />
          </dl>
        </SectionCard>

        <SectionCard title="Coverage & Capabilities">
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <InfoField label="Origin Coverage" value={fields.origin_coverage} />
            <InfoField label="Destination Coverage" value={fields.destination_coverage} />
            <div className="sm:col-span-2">
              <InfoField label="Other Services" value={fields.other_services} />
            </div>
          </dl>
          <div className="mt-4">
            <dt className="mb-2 text-xs text-neutral-muted">Capabilities</dt>
            <ToggleChipDisplay
              chips={CAPABILITY_FIELDS.map((capability) => ({
                label: capability.label,
                selected: Boolean(fields[capability.name]),
              }))}
            />
          </div>
        </SectionCard>

        <SectionCard title="Status & Notes">
          <dl className="grid grid-cols-1 gap-4">
            <InfoField label="Next Action" value={fields.next_action} />
            <InfoField label="Key Notes" value={fields.key_notes} />
          </dl>
        </SectionCard>

        <SectionCard title="Quotes">
          <p className="py-6 text-center text-sm text-neutral-muted">
            No quotes yet. Adding quotes is coming next.
          </p>
        </SectionCard>
      </div>
    </div>
  );
}

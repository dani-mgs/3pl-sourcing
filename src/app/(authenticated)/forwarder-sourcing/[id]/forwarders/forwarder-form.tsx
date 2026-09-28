"use client";

import { startTransition, useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/section-card";
import {
  CAPABILITY_FIELDS,
  FORWARDER_ASSESSMENT_OPTIONS,
  FORWARDER_STATUS_OPTIONS,
} from "@/lib/forwarder/forwarder-fields";
import type { ForwarderFields } from "@/lib/forwarder/parse-forwarder-form";
import {
  BooleanChipsField,
  InputField,
  SelectField,
  TextAreaField,
} from "../../form-fields";
import { createForwarder } from "./new/actions";
import { updateForwarder } from "./[forwarderId]/edit/actions";

export type ForwarderFormDefaults = Partial<ForwarderFields>;

export function ForwarderForm({
  projectId,
  forwarderId,
  defaultValues = {},
  cancelHref,
}: {
  projectId: string;
  forwarderId: string | null;
  defaultValues?: ForwarderFormDefaults;
  cancelHref: string;
}) {
  const isEdit = forwarderId !== null;

  // A Server Action reference can cross the client/server boundary; a
  // closure wrapping one (e.g. passed in as a prop from the page) can't. So
  // the form picks between the two actions itself rather than taking one in.
  const [state, formAction, pending] = useActionState<
    { error?: string },
    FormData
  >(
    async (_prev, formData) =>
      isEdit
        ? updateForwarder(projectId, forwarderId, formData)
        : createForwarder(projectId, formData),
    {},
  );

  return (
    <form
      // Submitted manually rather than via `action` so React doesn't reset
      // the uncontrolled fields when the server returns an error.
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        startTransition(() => formAction(formData));
      }}
      className="flex flex-col gap-6"
    >
      <SectionCard title="Company Info">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <InputField name="company_name" label="Company Name" defaultValue={defaultValues.company_name} />
          <InputField name="website" label="Website" defaultValue={defaultValues.website} />
          <InputField name="headquarters" label="Headquarters" defaultValue={defaultValues.headquarters} />
          <InputField name="footprint" label="Footprint" defaultValue={defaultValues.footprint} />
        </div>
      </SectionCard>

      <SectionCard title="Contact">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <InputField name="contact_person" label="Contact Person" defaultValue={defaultValues.contact_person} />
          <InputField name="contact_position" label="Contact Position" defaultValue={defaultValues.contact_position} />
          <InputField name="email" label="Email" type="text" defaultValue={defaultValues.email} />
          <InputField name="phone" label="Phone" defaultValue={defaultValues.phone} />
        </div>
      </SectionCard>

      <SectionCard title="Coverage & Capabilities">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <InputField name="origin_coverage" label="Origin Coverage" defaultValue={defaultValues.origin_coverage} />
          <InputField name="destination_coverage" label="Destination Coverage" defaultValue={defaultValues.destination_coverage} />
          <TextAreaField name="other_services" label="Other Services" defaultValue={defaultValues.other_services} />
          <BooleanChipsField
            label="Capabilities (confirmed)"
            options={CAPABILITY_FIELDS}
            defaultValues={defaultValues}
          />
        </div>
      </SectionCard>

      <SectionCard title="Status & Notes">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SelectField
            name="status"
            label="Status"
            options={FORWARDER_STATUS_OPTIONS}
            defaultValue={defaultValues.status ?? "Potential / Not Contacted"}
          />
          <SelectField
            name="assessment"
            label="Assessment"
            options={FORWARDER_ASSESSMENT_OPTIONS}
            defaultValue={defaultValues.assessment}
          />
          <InputField name="next_action" label="Next Action" defaultValue={defaultValues.next_action} />
          <TextAreaField name="key_notes" label="Key Notes" defaultValue={defaultValues.key_notes} />
        </div>
      </SectionCard>

      {state.error && (
        <p className="text-sm text-danger" role="alert">
          {state.error}
        </p>
      )}

      <div className="flex items-center justify-between gap-3">
        <Button
          type="button"
          variant="outline"
          nativeButton={false}
          render={<Link href={cancelHref} />}
          className="px-4 py-2.5"
        >
          Cancel
        </Button>
        <Button type="submit" disabled={pending} className="px-4 py-2.5">
          {pending ? "Saving..." : isEdit ? "Save Changes" : "Add Forwarder"}
        </Button>
      </div>
    </form>
  );
}

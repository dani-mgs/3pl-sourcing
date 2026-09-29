"use client";

import { startTransition, useActionState, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/section-card";
import {
  CAPABILITY_FIELDS,
  FORWARDER_ASSESSMENT_OPTIONS,
  FORWARDER_STATUS_OPTIONS,
} from "@/lib/forwarder/forwarder-fields";
import type { ForwarderFields } from "@/lib/forwarder/parse-forwarder-form";
import { mergeForwarderFields } from "@/lib/forwarder/merge-forwarder-fields";
import {
  BooleanChipsField,
  InputField,
  SelectField,
  TextAreaField,
} from "../../form-fields";
import { createForwarder } from "./new/actions";
import { extractForwarderDetails } from "./new/extract-actions";
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

  // Local, mutable copy of defaultValues so an edit-mode AI-extraction merge
  // can update the form after mount. formKey forces the uncontrolled field
  // widgets (defaultValue-based) to remount and pick up the new values.
  const [values, setValues] = useState<ForwarderFormDefaults>(defaultValues);
  const [highlighted, setHighlighted] = useState<Set<string>>(new Set());
  const [formKey, setFormKey] = useState(0);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadNotice, setUploadNotice] = useState<string | null>(null);
  const [isExtracting, startExtraction] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadFileName, setUploadFileName] = useState<string | null>(null);

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

  function handleUpload(formData: FormData) {
    setUploadError(null);
    setUploadNotice(null);
    startExtraction(async () => {
      const result = await extractForwarderDetails(formData, values);
      if ("error" in result) {
        setUploadError(result.error);
        return;
      }

      const { merged, changed } = mergeForwarderFields(values, result.fields);

      if (changed.size === 0) {
        setUploadNotice(
          "No new details found in that document — nothing was changed.",
        );
        setUploadOpen(false);
        return;
      }

      setValues(merged);
      setHighlighted(changed);
      setFormKey((k) => k + 1);
      setUploadOpen(false);
      setUploadNotice(
        `Updated ${changed.size} field${changed.size === 1 ? "" : "s"} from "${uploadFileName}" — review before saving.`,
      );
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {isEdit && (
        <div className="rounded-2xl border border-neutral-border bg-white p-6 shadow-sm">
          <h2 className="font-display text-lg font-semibold text-move-navy">
            Upload a Document to Update
          </h2>
          <p className="mt-1 text-sm text-neutral-muted">
            Accepts .txt, .pdf, or .docx. Fields the document gives a new value
            for are updated and marked &ldquo;Updated&rdquo; — review them
            before saving. Fields it doesn&apos;t mention stay as they are.
          </p>

          {!uploadOpen ? (
            <div className="mt-4">
              <Button
                type="button"
                variant="outline"
                className="px-4 py-2.5"
                onClick={() => {
                  setUploadNotice(null);
                  setUploadOpen(true);
                }}
              >
                Upload a Document
              </Button>
            </div>
          ) : (
            <form
              action={(formData) => {
                const file = fileInputRef.current?.files?.[0];
                setUploadFileName(file?.name ?? null);
                handleUpload(formData);
              }}
              className="mt-4 flex flex-col gap-4"
            >
              <input
                ref={fileInputRef}
                type="file"
                name="document"
                accept=".txt,.pdf,.docx"
                className="hidden"
                onChange={(e) => setUploadFileName(e.target.files?.[0]?.name ?? null)}
              />

              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  className="px-4 py-2.5"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isExtracting}
                >
                  Choose File
                </Button>
                <span className="text-sm text-neutral-muted">
                  {uploadFileName ?? "No file chosen"}
                </span>
              </div>

              {uploadError && <p className="text-sm text-danger">{uploadError}</p>}

              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  className="px-4 py-2.5"
                  onClick={() => {
                    setUploadOpen(false);
                    setUploadError(null);
                  }}
                  disabled={isExtracting}
                >
                  Cancel
                </Button>
                <Button type="submit" className="px-4 py-2.5" disabled={isExtracting}>
                  {isExtracting ? "Extracting..." : "Extract & Merge"}
                </Button>
              </div>
            </form>
          )}

          {uploadNotice && <p className="mt-4 text-sm text-move-navy">{uploadNotice}</p>}
        </div>
      )}

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
        <div key={formKey} className="contents">
          <SectionCard title="Company Info">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <InputField name="company_name" label="Company Name" defaultValue={values.company_name} />
              <InputField name="website" label="Website" defaultValue={values.website} updated={highlighted.has("website")} />
              <InputField name="headquarters" label="Headquarters" defaultValue={values.headquarters} updated={highlighted.has("headquarters")} />
              <InputField name="footprint" label="Footprint" defaultValue={values.footprint} updated={highlighted.has("footprint")} />
            </div>
          </SectionCard>

          <SectionCard title="Contact">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <InputField name="contact_person" label="Contact Person" defaultValue={values.contact_person} updated={highlighted.has("contact_person")} />
              <InputField name="contact_position" label="Contact Position" defaultValue={values.contact_position} updated={highlighted.has("contact_position")} />
              <InputField name="email" label="Email" type="text" defaultValue={values.email} updated={highlighted.has("email")} />
              <InputField name="phone" label="Phone" defaultValue={values.phone} updated={highlighted.has("phone")} />
            </div>
          </SectionCard>

          <SectionCard title="Coverage & Capabilities">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <InputField name="origin_coverage" label="Origin Coverage" defaultValue={values.origin_coverage} updated={highlighted.has("origin_coverage")} />
              <InputField name="destination_coverage" label="Destination Coverage" defaultValue={values.destination_coverage} updated={highlighted.has("destination_coverage")} />
              <TextAreaField name="other_services" label="Other Services" defaultValue={values.other_services} updated={highlighted.has("other_services")} />
              <BooleanChipsField
                label="Capabilities (confirmed)"
                options={CAPABILITY_FIELDS}
                defaultValues={values}
                updatedKeys={highlighted}
              />
            </div>
          </SectionCard>

          <SectionCard title="Status & Notes">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <SelectField
                name="status"
                label="Status"
                options={FORWARDER_STATUS_OPTIONS}
                defaultValue={values.status ?? "Potential / Not Contacted"}
              />
              <SelectField
                name="assessment"
                label="Assessment"
                options={FORWARDER_ASSESSMENT_OPTIONS}
                defaultValue={values.assessment}
              />
              <InputField name="next_action" label="Next Action" defaultValue={values.next_action} />
              <TextAreaField name="key_notes" label="Key Notes" defaultValue={values.key_notes} />
            </div>
          </SectionCard>
        </div>

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
    </div>
  );
}

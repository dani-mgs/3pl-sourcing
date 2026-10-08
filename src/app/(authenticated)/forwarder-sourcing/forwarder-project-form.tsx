"use client";

import { startTransition, useActionState, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/section-card";
import {
  ClientPicker,
  selectionDuplicates,
  type ClientSelection,
} from "@/components/client-picker";
import type { ClientOption } from "@/lib/clients";
import {
  PROJECT_DURATION_ERROR,
  PROJECT_STATUSES,
  SHIPMENT_MODES,
  SHIPMENT_TYPES_BY_MODE,
  isTypeAllowedForMode,
  type ShipmentMode,
} from "@/lib/forwarder/project-fields";
import { PROJECT_SECTIONS, type ProjectField } from "@/lib/forwarder/project-sections";
import type { ForwarderProjectFields } from "@/lib/forwarder/parse-project-form";
import { mergeForwarderProjectFields } from "@/lib/forwarder/merge-project-fields";
import { saveForwarderProject, type SaveForwarderProjectState } from "./actions";
import { extractForwarderProjectIntake } from "./new/extract-actions";
import { InputField, MultiChipField, SelectField, TextAreaField } from "./form-fields";

export type ForwarderProjectDefaults = Partial<ForwarderProjectFields>;

type ModeName = "shipment_mode" | "final_shipment_mode";
type TypeName = "shipment_type" | "final_shipment_type";

export function ForwarderProjectForm({
  projectId,
  clients,
  initialClient,
  defaultValues = {},
  cancelHref,
}: {
  projectId: string | null;
  clients: ClientOption[];
  initialClient: ClientSelection;
  defaultValues?: ForwarderProjectDefaults;
  cancelHref: string;
}) {
  const isEdit = projectId !== null;
  const [client, setClient] = useState<ClientSelection>(initialClient);
  const [localError, setLocalError] = useState<string | null>(null);

  // Local, mutable copy of defaultValues so an edit-mode AI-extraction merge
  // can update the form after mount. formKey forces the uncontrolled field
  // widgets (defaultValue-based) to remount and pick up the new values.
  const [values, setValues] = useState<ForwarderProjectDefaults>(defaultValues);
  const [highlighted, setHighlighted] = useState<Set<string>>(new Set());
  const [formKey, setFormKey] = useState(0);

  // Mode and type are controlled so the type list can follow the mode.
  const [pairs, setPairs] = useState<Record<ModeName | TypeName, string>>({
    shipment_mode: defaultValues.shipment_mode ?? "",
    shipment_type: defaultValues.shipment_type ?? "",
    final_shipment_mode: defaultValues.final_shipment_mode ?? "",
    final_shipment_type: defaultValues.final_shipment_type ?? "",
  });

  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadNotice, setUploadNotice] = useState<string | null>(null);
  const [isExtracting, startExtraction] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadFileName, setUploadFileName] = useState<string | null>(null);

  const [state, formAction, pending] = useActionState<
    SaveForwarderProjectState,
    FormData
  >(async (_prev, formData) => saveForwarderProject(projectId, formData), {});

  // A server-side duplicate is fed back so the picker can offer it.
  const knownClients =
    state.existingClient && !clients.some((c) => c.id === state.existingClient!.id)
      ? [...clients, state.existingClient]
      : clients;

  function handleUpload(formData: FormData) {
    setUploadError(null);
    setUploadNotice(null);
    startExtraction(async () => {
      const result = await extractForwarderProjectIntake(formData, values);
      if ("error" in result) {
        setUploadError(result.error);
        return;
      }

      const { merged, changed } = mergeForwarderProjectFields(values, result.fields);

      if (changed.size === 0) {
        setUploadNotice(
          "No new details found in that document — nothing was changed.",
        );
        setUploadOpen(false);
        return;
      }

      setValues(merged);
      setHighlighted(changed);
      setPairs({
        shipment_mode: merged.shipment_mode ?? "",
        shipment_type: merged.shipment_type ?? "",
        final_shipment_mode: merged.final_shipment_mode ?? "",
        final_shipment_type: merged.final_shipment_type ?? "",
      });
      setFormKey((k) => k + 1);
      setUploadOpen(false);
      setUploadNotice(
        `Updated ${changed.size} field${changed.size === 1 ? "" : "s"} from "${uploadFileName}" — review before saving.`,
      );
    });
  }

  function renderField(field: ProjectField) {
    const value = values[field.name];
    const updated = highlighted.has(field.name);
    switch (field.kind) {
      case "text":
        return <InputField key={field.name} name={field.name} label={field.label} defaultValue={value as string} updated={updated} />;
      case "textarea":
        return <TextAreaField key={field.name} name={field.name} label={field.label} defaultValue={value as string} updated={updated} />;
      case "integer":
        return (
          <InputField
            key={field.name}
            name={field.name}
            label={field.formLabel ?? field.label}
            type="number"
            step="1"
            min={field.min}
            max={field.max}
            inputMode="numeric"
            invalidMessage={field.name === "project_duration_months" ? PROJECT_DURATION_ERROR : undefined}
            defaultValue={value as number}
            updated={updated}
          />
        );
      case "decimal":
        return <InputField key={field.name} name={field.name} label={field.label} type="number" step={field.step} defaultValue={value as number} updated={updated} />;
      case "money":
        return <InputField key={field.name} name={field.name} label={field.label} type="number" step="0.01" defaultValue={value as number} updated={updated} />;
      case "select":
        return <SelectField key={field.name} name={field.name} label={field.label} options={field.options} defaultValue={value as string} updated={updated} />;
      case "multi":
        return <MultiChipField key={field.name} name={field.name} label={field.label} options={field.options} defaultValue={value as string[]} updated={updated} />;
      case "mode": {
        const modeName = field.name as ModeName;
        const typeName = modeName === "shipment_mode" ? "shipment_type" : "final_shipment_type";
        return (
          <SelectField
            key={field.name}
            name={field.name}
            label={field.label}
            options={SHIPMENT_MODES}
            value={pairs[modeName]}
            updated={updated}
            onChange={(mode) =>
              setPairs((prev) => ({
                ...prev,
                [modeName]: mode,
                // Drop a type that no longer fits the new mode.
                [typeName]: isTypeAllowedForMode(mode || null, prev[typeName] || null)
                  ? prev[typeName]
                  : "",
              }))
            }
          />
        );
      }
      case "type": {
        const typeName = field.name as TypeName;
        const mode = pairs[field.modeField as ModeName];
        return (
          <SelectField
            key={field.name}
            name={field.name}
            label={field.label}
            options={mode ? SHIPMENT_TYPES_BY_MODE[mode as ShipmentMode] : []}
            value={pairs[typeName]}
            updated={highlighted.has(typeName)}
            onChange={(type) => setPairs((prev) => ({ ...prev, [typeName]: type }))}
            disabled={!mode}
            placeholder={mode ? "Select…" : "Choose a mode first"}
          />
        );
      }
    }
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
        // Submitted manually rather than via `action` so React doesn't reset the
        // uncontrolled fields when the server returns an error.
        onSubmit={(event) => {
          event.preventDefault();
          setLocalError(null);
          if (client.mode === "existing" && !client.clientId) {
            setLocalError("Choose a client.");
            return;
          }
          if (selectionDuplicates(client, knownClients)) return;
          const formData = new FormData(event.currentTarget);
          startTransition(() => formAction(formData));
        }}
        className="flex flex-col gap-6"
      >
        <section className="rounded-2xl border border-neutral-border bg-white p-6 shadow-sm">
          <ClientPicker
            clients={knownClients}
            value={client}
            onChange={(next) => {
              setClient(next);
              setLocalError(null);
            }}
            allowNew={!isEdit}
            serverDuplicate={state.existingClient}
          />
          {isEdit && (
            <p className="mt-3 text-xs text-neutral-muted">
              You can move this project to another existing client. Client names
              and business models can only be edited by an admin.
            </p>
          )}
        </section>

        {isEdit && (
          <SectionCard title="Project Status">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <SelectField
                name="status"
                label="Status"
                options={PROJECT_STATUSES}
                defaultValue={values.status ?? "Active"}
              />
            </div>
          </SectionCard>
        )}

        <div key={formKey} className="contents">
          {PROJECT_SECTIONS.map((section) => (
            <SectionCard key={section.title} title={section.title}>
              {section.description && (
                <p className="-mt-2 mb-4 text-xs text-neutral-muted">{section.description}</p>
              )}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {section.fields.map(renderField)}
              </div>
            </SectionCard>
          ))}
        </div>

        {(localError || state.error) && (
          <p className="text-sm text-danger" role="alert">
            {localError ?? state.error}
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
            {pending ? "Saving..." : isEdit ? "Save Changes" : "Create Project"}
          </Button>
        </div>
      </form>
    </div>
  );
}

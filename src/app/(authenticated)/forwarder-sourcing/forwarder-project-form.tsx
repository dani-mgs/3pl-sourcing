"use client";

import { startTransition, useActionState, useState } from "react";
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
  PROJECT_STATUSES,
  SHIPMENT_MODES,
  SHIPMENT_TYPES_BY_MODE,
  isTypeAllowedForMode,
  type ShipmentMode,
} from "@/lib/forwarder/project-fields";
import { PROJECT_SECTIONS, type ProjectField } from "@/lib/forwarder/project-sections";
import type { ForwarderProjectFields } from "@/lib/forwarder/parse-project-form";
import { saveForwarderProject, type SaveForwarderProjectState } from "./actions";
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

  // Mode and type are controlled so the type list can follow the mode.
  const [pairs, setPairs] = useState<Record<ModeName | TypeName, string>>({
    shipment_mode: defaultValues.shipment_mode ?? "",
    shipment_type: defaultValues.shipment_type ?? "",
    final_shipment_mode: defaultValues.final_shipment_mode ?? "",
    final_shipment_type: defaultValues.final_shipment_type ?? "",
  });

  const [state, formAction, pending] = useActionState<
    SaveForwarderProjectState,
    FormData
  >(async (_prev, formData) => saveForwarderProject(projectId, formData), {});

  // A server-side duplicate is fed back so the picker can offer it.
  const knownClients =
    state.existingClient && !clients.some((c) => c.id === state.existingClient!.id)
      ? [...clients, state.existingClient]
      : clients;

  function renderField(field: ProjectField) {
    const value = defaultValues[field.name];
    switch (field.kind) {
      case "text":
        return <InputField key={field.name} name={field.name} label={field.label} defaultValue={value as string} />;
      case "textarea":
        return <TextAreaField key={field.name} name={field.name} label={field.label} defaultValue={value as string} />;
      case "integer":
        return <InputField key={field.name} name={field.name} label={field.label} type="number" step="1" defaultValue={value as number} />;
      case "decimal":
        return <InputField key={field.name} name={field.name} label={field.label} type="number" step={field.step} defaultValue={value as number} />;
      case "money":
        return <InputField key={field.name} name={field.name} label={field.label} type="number" step="0.01" defaultValue={value as number} />;
      case "select":
        return <SelectField key={field.name} name={field.name} label={field.label} options={field.options} defaultValue={value as string} />;
      case "multi":
        return <MultiChipField key={field.name} name={field.name} label={field.label} options={field.options} defaultValue={value as string[]} />;
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
            onChange={(type) => setPairs((prev) => ({ ...prev, [typeName]: type }))}
            disabled={!mode}
            placeholder={mode ? "Select…" : "Choose a mode first"}
          />
        );
      }
    }
  }

  return (
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
              defaultValue={defaultValues.status ?? "Active"}
            />
          </div>
        </SectionCard>
      )}

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
  );
}

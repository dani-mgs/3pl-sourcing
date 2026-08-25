"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { saveRecommendation, type SaveRecommendationState } from "./actions";

const PRIORITY_OPTIONS = [
  "Cost Savings",
  "Quality of Service",
  "Turnaround Time",
] as const;

export type VettedProvider = {
  id: string;
  company_name: string;
  cost: string | null;
  service_capability: string | null;
  turnaround_time: string | null;
};

export type RecommendationRow = {
  priority: string | null;
  provider_id_1: string | null;
  provider_id_2: string | null;
  provider_id_3: string | null;
  notes: string | null;
};

const fieldClass =
  "rounded-xl border border-neutral-border px-3 py-2 text-sm text-move-navy placeholder:italic placeholder:text-gray-400 focus:border-move-green focus:outline-none focus:ring-2 focus:ring-move-green";
const labelClass = "text-sm font-medium text-move-navy";

function ChoiceSelect({
  id,
  name,
  label,
  providers,
  value,
  onValueChange,
}: {
  id: string;
  name: string;
  label: string;
  providers: VettedProvider[];
  value: string | undefined;
  onValueChange: (value: string | undefined) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <Select
        name={name}
        items={providers.map((p) => ({ value: p.id, label: p.company_name }))}
        value={value ?? null}
        onValueChange={(newValue) => onValueChange(newValue ?? undefined)}
        required
      >
        <SelectTrigger id={id} className="w-full rounded-xl border-neutral-border">
          <SelectValue placeholder="Select a provider" />
        </SelectTrigger>
        <SelectContent>
          {providers.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.company_name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function RecommendationForm({
  projectId,
  providers,
  recommendation,
}: {
  projectId: string;
  providers: VettedProvider[];
  recommendation: RecommendationRow | null;
}) {
  const [state, formAction, pending] = useActionState<
    SaveRecommendationState,
    FormData
  >(async (_prevState, formData) => saveRecommendation(projectId, formData), {});

  const [choice1, setChoice1] = useState<string | undefined>(
    recommendation?.provider_id_1 ?? undefined,
  );
  const [choice2, setChoice2] = useState<string | undefined>(
    recommendation?.provider_id_2 ?? undefined,
  );
  const [choice3, setChoice3] = useState<string | undefined>(
    recommendation?.provider_id_3 ?? undefined,
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-2xl border border-neutral-border bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-neutral-border">
                <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-neutral-muted">
                  Company
                </th>
                <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-neutral-muted">
                  Cost
                </th>
                <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-neutral-muted">
                  Service Capability
                </th>
                <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-neutral-muted">
                  Turnaround Time
                </th>
              </tr>
            </thead>
            <tbody>
              {providers.map((provider) => (
                <tr
                  key={provider.id}
                  className="border-b border-neutral-border last:border-b-0"
                >
                  <td className="px-4 py-3 text-move-navy">
                    {provider.company_name}
                  </td>
                  <td className="px-4 py-3 text-neutral-muted">
                    {provider.cost || "—"}
                  </td>
                  <td className="px-4 py-3 text-neutral-muted">
                    {provider.service_capability || "—"}
                  </td>
                  <td className="px-4 py-3 text-neutral-muted">
                    {provider.turnaround_time || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <form
        action={formAction}
        className="flex flex-col gap-4 rounded-2xl border border-neutral-border bg-white p-6 shadow-sm"
      >
        <div className="flex flex-col gap-1">
          <label htmlFor="priority" className={labelClass}>
            Priority
          </label>
          <Select
            name="priority"
            defaultValue={recommendation?.priority ?? "Cost Savings"}
          >
            <SelectTrigger id="priority" className="w-full rounded-xl border-neutral-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRIORITY_OPTIONS.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <ChoiceSelect
            id="provider_id_1"
            name="provider_id_1"
            label="1st Choice"
            providers={providers.filter(
              (p) => p.id !== choice2 && p.id !== choice3,
            )}
            value={choice1}
            onValueChange={setChoice1}
          />
          <ChoiceSelect
            id="provider_id_2"
            name="provider_id_2"
            label="2nd Choice"
            providers={providers.filter(
              (p) => p.id !== choice1 && p.id !== choice3,
            )}
            value={choice2}
            onValueChange={setChoice2}
          />
          <ChoiceSelect
            id="provider_id_3"
            name="provider_id_3"
            label="3rd Choice"
            providers={providers.filter(
              (p) => p.id !== choice1 && p.id !== choice2,
            )}
            value={choice3}
            onValueChange={setChoice3}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="notes" className={labelClass}>
            Notes
          </label>
          <textarea
            id="notes"
            name="notes"
            rows={3}
            defaultValue={recommendation?.notes ?? ""}
            className={fieldClass}
          />
        </div>

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending} className="px-4 py-2.5">
            {pending ? "Saving..." : "Save Recommendation"}
          </Button>

          {state.success && (
            <span className="text-sm font-medium text-move-green">
              Saved
            </span>
          )}
          {state.error && (
            <span className="text-sm text-danger">{state.error}</span>
          )}
        </div>
      </form>
    </div>
  );
}

"use client";

import { useActionState, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge, type ProviderStatus } from "../providers/status-badge";
import { saveRecommendation, type SaveRecommendationState } from "./actions";

const PRIORITY_OPTIONS = [
  "Cost Savings",
  "Quality of Service",
  "Turnaround Time",
] as const;

type Priority = (typeof PRIORITY_OPTIONS)[number];

export type VettedProvider = {
  id: string;
  company_name: string;
  cost: string | null;
  service_capability: string | null;
  turnaround_time: string | null;
  status: string;
  created_at: string;
};

export type RecommendationRow = {
  priority: string | null;
};

const labelClass = "text-sm font-medium text-move-navy";

function parseLeadingNumber(value: string | null): number | null {
  if (!value) return null;
  const match = value.match(/\d+(\.\d+)?/);
  if (!match) return null;
  const parsed = parseFloat(match[0]);
  return Number.isNaN(parsed) ? null : parsed;
}

function rankProviders(
  providers: VettedProvider[],
  priority: Priority,
): { provider: VettedProvider; rank: number | null; parsed: number | null }[] {
  if (priority === "Quality of Service") {
    return providers.map((provider) => ({
      provider,
      rank: null,
      parsed: null,
    }));
  }

  const field = priority === "Cost Savings" ? "cost" : "turnaround_time";

  const withParsed = providers.map((provider) => ({
    provider,
    parsed: parseLeadingNumber(provider[field]),
  }));

  withParsed.sort((a, b) => {
    if (a.parsed === null && b.parsed === null) return 0;
    if (a.parsed === null) return 1;
    if (b.parsed === null) return -1;
    return a.parsed - b.parsed;
  });

  let rank = 0;
  return withParsed.map(({ provider, parsed }) => {
    if (parsed === null) {
      return { provider, rank: null, parsed };
    }
    rank += 1;
    return { provider, rank, parsed };
  });
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

  const [priority, setPriority] = useState<Priority>(
    (recommendation?.priority as Priority | undefined) ?? "Cost Savings",
  );

  const ranked = useMemo(
    () => rankProviders(providers, priority),
    [providers, priority],
  );

  const topThreeIds = ranked.slice(0, 3).map((entry) => entry.provider.id);

  return (
    <div className="flex flex-col gap-6">
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
            value={priority}
            onValueChange={(value) => setPriority(value as Priority)}
          >
            <SelectTrigger id="priority" className="w-full rounded-xl border-neutral-border sm:w-72">
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

        {priority === "Quality of Service" && (
          <p className="text-sm text-neutral-muted">
            Quality of Service can&apos;t be automatically ranked from
            current data — compare each provider&apos;s Service Capability
            notes below.
          </p>
        )}

        <input type="hidden" name="provider_id_1" value={topThreeIds[0] ?? ""} />
        <input type="hidden" name="provider_id_2" value={topThreeIds[1] ?? ""} />
        <input type="hidden" name="provider_id_3" value={topThreeIds[2] ?? ""} />

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

      <div className="flex flex-col gap-4">
        {ranked.map(({ provider, rank }) => (
          <div
            key={provider.id}
            className="rounded-2xl border border-neutral-border bg-white p-6 shadow-sm"
          >
            <div className="mb-4 flex items-center gap-3">
              {rank !== null ? (
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-move-green text-xs font-semibold text-white">
                  {rank}
                </span>
              ) : priority !== "Quality of Service" ? (
                <span className="rounded-full bg-[#F1F2F4] px-2 py-0.5 text-xs font-medium text-neutral-muted">
                  Not enough data to rank
                </span>
              ) : null}
              <h2 className="font-display text-lg font-semibold text-move-navy">
                {provider.company_name}
              </h2>
              <StatusBadge status={provider.status as ProviderStatus} />
            </div>

            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <dt className="text-xs text-neutral-muted">Cost</dt>
                <dd className="text-sm text-move-navy">
                  {provider.cost || "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-neutral-muted">
                  Service Capability
                </dt>
                <dd className="text-sm text-move-navy">
                  {provider.service_capability || "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-neutral-muted">
                  Turnaround Time
                </dt>
                <dd className="text-sm text-move-navy">
                  {provider.turnaround_time || "—"}
                </dd>
              </div>
            </dl>

            <div className="mt-4 rounded-xl border border-neutral-border bg-neutral-bg p-4">
              <h3 className="text-sm font-medium text-move-navy">
                AI Summary
              </h3>
              <p className="mt-1 text-sm text-neutral-muted">
                AI-generated summary coming soon
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

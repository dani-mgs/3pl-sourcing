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
  location: string | null;
  status: string;
  overall_assessment: string | null;
  storage_cost: number | null;
  pick_pack_cost: number | null;
  receiving_cost: number | null;
  returns_cost: number | null;
  created_at: string;
};

export type RecommendationRow = {
  priority: string | null;
};

const labelClass = "text-sm font-medium text-move-navy";

const USD_FORMATTER = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

function totalCost(provider: VettedProvider): number | null {
  const costs = [
    provider.storage_cost,
    provider.pick_pack_cost,
    provider.receiving_cost,
    provider.returns_cost,
  ];
  const hasCostData = costs.some((c) => c != null);
  if (!hasCostData) return null;
  return costs.reduce((sum: number, c) => sum + (c ?? 0), 0);
}

function rankProviders(
  providers: VettedProvider[],
  priority: Priority,
): { provider: VettedProvider; rank: number | null }[] {
  if (priority !== "Cost Savings") {
    return providers.map((provider) => ({ provider, rank: null }));
  }

  const withCost = providers.map((provider) => ({
    provider,
    cost: totalCost(provider),
  }));

  withCost.sort((a, b) => {
    if (a.cost === null && b.cost === null) return 0;
    if (a.cost === null) return 1;
    if (b.cost === null) return -1;
    return a.cost - b.cost;
  });

  let rank = 0;
  return withCost.map(({ provider, cost }) => {
    if (cost === null) {
      return { provider, rank: null };
    }
    rank += 1;
    return { provider, rank };
  });
}

export function RecommendationForm({
  projectId,
  providers,
  recommendation,
  canWrite,
}: {
  projectId: string;
  providers: VettedProvider[];
  recommendation: RecommendationRow | null;
  canWrite: boolean;
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
            current data — compare each provider&apos;s Overall Assessment
            notes below.
          </p>
        )}

        {priority === "Turnaround Time" && (
          <p className="text-sm text-neutral-muted">
            Turnaround Time can&apos;t be automatically ranked from current
            data.
          </p>
        )}

        <input type="hidden" name="provider_id_1" value={topThreeIds[0] ?? ""} />
        <input type="hidden" name="provider_id_2" value={topThreeIds[1] ?? ""} />
        <input type="hidden" name="provider_id_3" value={topThreeIds[2] ?? ""} />

        {canWrite && (
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
        )}
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
              ) : priority === "Cost Savings" ? (
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
                <dt className="text-xs text-neutral-muted">Total Cost</dt>
                <dd className="text-sm text-move-navy">
                  {totalCost(provider) != null
                    ? USD_FORMATTER.format(totalCost(provider)!)
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-neutral-muted">Location</dt>
                <dd className="text-sm text-move-navy">
                  {provider.location || "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-neutral-muted">
                  Overall Assessment
                </dt>
                <dd className="text-sm text-move-navy">
                  {provider.overall_assessment || "—"}
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

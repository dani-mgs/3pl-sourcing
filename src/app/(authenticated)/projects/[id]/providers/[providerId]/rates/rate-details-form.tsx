"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { saveRateDetails, type SaveRateDetailsState } from "./actions";

export type RateDetailsRow = {
  receiving_rate: number | null;
  storage_rate: number | null;
  fulfillment_rate: number | null;
  dispatch_rate: number | null;
  adhoc_kitting_rate: number | null;
  adhoc_labelling_rate: number | null;
  returns_rate: number | null;
  annual_inv_count_rate: number | null;
  cycle_count_rate: number | null;
  inv_count_on_request_rate: number | null;
  setup_rate: number | null;
  onboarding_fee: number | null;
  security_deposit: number | null;
};

const RATE_FIELDS: { name: keyof RateDetailsRow; label: string }[] = [
  { name: "receiving_rate", label: "Receiving Rate" },
  { name: "storage_rate", label: "Storage Rate" },
  { name: "fulfillment_rate", label: "Fulfillment Rate" },
  { name: "dispatch_rate", label: "Dispatch Rate" },
  { name: "adhoc_kitting_rate", label: "Adhoc Kitting/Bundling Rate" },
  { name: "adhoc_labelling_rate", label: "Adhoc Labelling Rate" },
  { name: "returns_rate", label: "Returns Rate" },
  { name: "annual_inv_count_rate", label: "Annual Inventory Count Rate" },
  { name: "cycle_count_rate", label: "Cycle Count Rate" },
  {
    name: "inv_count_on_request_rate",
    label: "Inventory Count on Request Rate",
  },
  { name: "setup_rate", label: "One-Time Setup Rate" },
  { name: "onboarding_fee", label: "Onboarding Fee" },
  { name: "security_deposit", label: "Security Deposit" },
];

const labelClass = "text-sm font-medium text-move-navy";
const fieldClass =
  "rounded-xl border border-neutral-border px-3 py-2 text-sm text-move-navy placeholder:italic placeholder:text-gray-400 focus:border-move-green focus:outline-none focus:ring-2 focus:ring-move-green disabled:cursor-not-allowed disabled:bg-neutral-bg disabled:text-neutral-muted";

export function RateDetailsForm({
  clientRequirementId,
  providerId,
  rateDetails,
  canWrite,
}: {
  clientRequirementId: string;
  providerId: string;
  rateDetails: RateDetailsRow | null;
  canWrite: boolean;
}) {
  const [state, formAction, pending] = useActionState<
    SaveRateDetailsState,
    FormData
  >(
    async (_prevState, formData) =>
      saveRateDetails(clientRequirementId, providerId, formData),
    {},
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {RATE_FIELDS.map((field) => (
          <div key={field.name} className="flex flex-col gap-1">
            <label htmlFor={field.name} className={labelClass}>
              {field.label}
            </label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-neutral-muted">$</span>
              <input
                id={field.name}
                name={field.name}
                type="number"
                min="0"
                step="0.01"
                defaultValue={rateDetails?.[field.name] ?? ""}
                disabled={!canWrite}
                className={`${fieldClass} flex-1`}
              />
            </div>
          </div>
        ))}
      </div>

      {canWrite && (
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending} className="mt-2 px-4 py-2.5">
            {pending ? "Saving..." : "Save"}
          </Button>

          {state.success && (
            <span className="text-sm font-medium text-move-green">Saved</span>
          )}
          {state.error && (
            <span className="text-sm text-danger">{state.error}</span>
          )}
        </div>
      )}
    </form>
  );
}

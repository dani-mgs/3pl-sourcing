"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import {
  saveRequirementsSummary,
  type SaveRequirementsSummaryState,
} from "./actions";

export type RequirementsSummaryRow = {
  location: string | null;
  storage_requirements: string | null;
  order_volume: string | null;
  sku_count: string | null;
  b2b_or_b2c: string | null;
  special_handling: string | null;
  target_cost: string | null;
  turnaround_time: string | null;
  notes: string | null;
};

const fieldClass =
  "rounded-xl border border-neutral-border px-3 py-2 text-sm text-move-navy placeholder:italic placeholder:text-gray-400 focus:border-move-green focus:outline-none focus:ring-2 focus:ring-move-green";
const labelClass = "text-sm font-medium text-move-navy";

export function RequirementsSummaryForm({
  projectId,
  summary,
}: {
  projectId: string;
  summary: RequirementsSummaryRow | null;
}) {
  const [state, formAction, pending] = useActionState<
    SaveRequirementsSummaryState,
    FormData
  >(
    async (_prevState, formData) =>
      saveRequirementsSummary(projectId, formData),
    {},
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="location" className={labelClass}>
            Location
          </label>
          <input
            id="location"
            name="location"
            type="text"
            placeholder="e.g. Los Angeles, USA"
            defaultValue={summary?.location ?? ""}
            className={fieldClass}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="order_volume" className={labelClass}>
            Order Volume
          </label>
          <input
            id="order_volume"
            name="order_volume"
            type="text"
            placeholder="e.g. 500 units/month"
            defaultValue={summary?.order_volume ?? ""}
            className={fieldClass}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="sku_count" className={labelClass}>
            SKU Count
          </label>
          <input
            id="sku_count"
            name="sku_count"
            type="number"
            min="0"
            step="1"
            placeholder="e.g. 150"
            defaultValue={summary?.sku_count ?? ""}
            className={fieldClass}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="b2b_or_b2c" className={labelClass}>
            B2B or B2C
          </label>
          <select
            id="b2b_or_b2c"
            name="b2b_or_b2c"
            defaultValue={summary?.b2b_or_b2c ?? "B2B"}
            className={fieldClass}
          >
            <option value="B2B">B2B</option>
            <option value="B2C">B2C</option>
            <option value="Both">Both</option>
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="target_cost" className={labelClass}>
            Target Cost
          </label>
          <input
            id="target_cost"
            name="target_cost"
            type="text"
            placeholder="e.g. $50,000"
            defaultValue={summary?.target_cost ?? ""}
            className={fieldClass}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="turnaround_time" className={labelClass}>
            Required Turnaround Time
          </label>
          <input
            id="turnaround_time"
            name="turnaround_time"
            type="text"
            placeholder="e.g. 24-48 hours"
            defaultValue={summary?.turnaround_time ?? ""}
            className={fieldClass}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="storage_requirements" className={labelClass}>
          Storage Requirements
        </label>
        <textarea
          id="storage_requirements"
          name="storage_requirements"
          rows={3}
          placeholder="e.g. Climate-controlled, hazmat-certified"
          defaultValue={summary?.storage_requirements ?? ""}
          className={fieldClass}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="special_handling" className={labelClass}>
          Special Handling Requirements
        </label>
        <textarea
          id="special_handling"
          name="special_handling"
          rows={3}
          placeholder="e.g. Fragile items, temperature-sensitive"
          defaultValue={summary?.special_handling ?? ""}
          className={fieldClass}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="notes" className={labelClass}>
          Other Notes
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={3}
          defaultValue={summary?.notes ?? ""}
          className={fieldClass}
        />
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending} className="px-4 py-2.5">
          {pending ? "Saving..." : "Save"}
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
  );
}

"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import {
  updateClientRequirements,
  type SaveClientRequirementsState,
} from "./actions";

export type ClientRequirementsFields = {
  current_incumbent_3pl: string | null;
  target_geography: string | null;
  benchmark_period: string | null;
  avg_monthly_orders: number | null;
  peak_monthly_orders: number | null;
  latest_month_orders: number | null;
  avg_monthly_units: number | null;
  peak_monthly_units: number | null;
  business_model: string | null;
  core_cost_categories: string | null;
  main_decision_focus: string | null;
  key_capability_needs: string | null;
  tech_integration_requirement: string | null;
  special_handling_requirement: string | null;
  fixed_comparison_principle: string | null;
  important_limitation: string | null;
  assumptions_data_limitations: string | null;
};

const fieldClass =
  "rounded-xl border border-neutral-border px-3 py-2 text-sm text-move-navy placeholder:italic placeholder:text-gray-400 focus:border-move-green focus:outline-none focus:ring-2 focus:ring-move-green";
const labelClass = "text-sm font-medium text-move-navy";
const sectionTitleClass =
  "font-display text-lg font-semibold text-move-navy";

function TextField({
  name,
  label,
  defaultValue,
  placeholder,
}: {
  name: string;
  label: string;
  defaultValue: string | null;
  placeholder?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={name} className={labelClass}>
        {label}
      </label>
      <input
        id={name}
        name={name}
        type="text"
        placeholder={placeholder}
        defaultValue={defaultValue ?? ""}
        className={fieldClass}
      />
    </div>
  );
}

function NumberField({
  name,
  label,
  defaultValue,
  placeholder,
}: {
  name: string;
  label: string;
  defaultValue: number | null;
  placeholder?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={name} className={labelClass}>
        {label}
      </label>
      <input
        id={name}
        name={name}
        type="number"
        min="0"
        step="1"
        placeholder={placeholder}
        defaultValue={defaultValue ?? ""}
        className={fieldClass}
      />
    </div>
  );
}

function TextAreaField({
  name,
  label,
  defaultValue,
  placeholder,
}: {
  name: string;
  label: string;
  defaultValue: string | null;
  placeholder?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={name} className={labelClass}>
        {label}
      </label>
      <textarea
        id={name}
        name={name}
        rows={3}
        placeholder={placeholder}
        defaultValue={defaultValue ?? ""}
        className={fieldClass}
      />
    </div>
  );
}

export function ClientRequirementsForm({
  clientRequirementId,
  fields,
}: {
  clientRequirementId: string;
  fields: ClientRequirementsFields;
}) {
  const [state, formAction, pending] = useActionState<
    SaveClientRequirementsState,
    FormData
  >(
    async (_prevState, formData) =>
      updateClientRequirements(clientRequirementId, formData),
    {},
  );

  return (
    <form action={formAction} className="flex flex-col gap-8">
      <section className="rounded-2xl border border-neutral-border bg-white p-6 shadow-sm">
        <h2 className={sectionTitleClass}>Client Overview</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField
            name="current_incumbent_3pl"
            label="Current Incumbent 3PL"
            defaultValue={fields.current_incumbent_3pl}
            placeholder="e.g. ShipBob"
          />
          <TextField
            name="target_geography"
            label="Target Geography"
            defaultValue={fields.target_geography}
            placeholder="e.g. Los Angeles, USA"
          />
          <TextField
            name="benchmark_period"
            label="Benchmark Period"
            defaultValue={fields.benchmark_period}
            placeholder="e.g. Q1 2026"
          />
        </div>
      </section>

      <section className="rounded-2xl border border-neutral-border bg-white p-6 shadow-sm">
        <h2 className={sectionTitleClass}>Volume Metrics</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <NumberField
            name="avg_monthly_orders"
            label="Avg Monthly Orders"
            defaultValue={fields.avg_monthly_orders}
          />
          <NumberField
            name="peak_monthly_orders"
            label="Peak Monthly Orders"
            defaultValue={fields.peak_monthly_orders}
          />
          <NumberField
            name="latest_month_orders"
            label="Latest Month Orders"
            defaultValue={fields.latest_month_orders}
          />
          <NumberField
            name="avg_monthly_units"
            label="Avg Monthly Units"
            defaultValue={fields.avg_monthly_units}
          />
          <NumberField
            name="peak_monthly_units"
            label="Peak Monthly Units"
            defaultValue={fields.peak_monthly_units}
          />
        </div>
      </section>

      <section className="rounded-2xl border border-neutral-border bg-white p-6 shadow-sm">
        <h2 className={sectionTitleClass}>Business Context</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField
            name="business_model"
            label="Business Model"
            defaultValue={fields.business_model}
            placeholder="e.g. B2C DTC"
          />
          <TextField
            name="core_cost_categories"
            label="Core Cost Categories"
            defaultValue={fields.core_cost_categories}
            placeholder="e.g. Storage, pick & pack, freight"
          />
          <TextField
            name="main_decision_focus"
            label="Main Decision Focus"
            defaultValue={fields.main_decision_focus}
            placeholder="e.g. Cost savings"
          />
        </div>
      </section>

      <section className="rounded-2xl border border-neutral-border bg-white p-6 shadow-sm">
        <h2 className={sectionTitleClass}>Requirements &amp; Constraints</h2>
        <div className="mt-4 flex flex-col gap-4">
          <TextAreaField
            name="key_capability_needs"
            label="Key Capability Needs"
            defaultValue={fields.key_capability_needs}
          />
          <TextAreaField
            name="tech_integration_requirement"
            label="Tech Integration Requirement"
            defaultValue={fields.tech_integration_requirement}
          />
          <TextAreaField
            name="special_handling_requirement"
            label="Special Handling Requirement"
            defaultValue={fields.special_handling_requirement}
          />
          <TextAreaField
            name="fixed_comparison_principle"
            label="Fixed Comparison Principle"
            defaultValue={fields.fixed_comparison_principle}
          />
          <TextAreaField
            name="important_limitation"
            label="Important Limitation"
            defaultValue={fields.important_limitation}
          />
          <TextAreaField
            name="assumptions_data_limitations"
            label="Assumptions / Data Limitations"
            defaultValue={fields.assumptions_data_limitations}
          />
        </div>
      </section>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending} className="px-4 py-2.5">
          {pending ? "Saving..." : "Save"}
        </Button>

        {state.success && (
          <span className="text-sm font-medium text-move-green">Saved</span>
        )}
        {state.error && (
          <span className="text-sm text-danger">{state.error}</span>
        )}
      </div>
    </form>
  );
}

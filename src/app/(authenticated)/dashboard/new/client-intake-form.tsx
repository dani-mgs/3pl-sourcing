"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { saveClientIntake, type SaveClientIntakeState } from "./actions";

const fieldClass =
  "rounded-xl border border-neutral-border px-3 py-2 text-sm text-move-navy placeholder:italic placeholder:text-gray-400 focus:border-move-green focus:outline-none focus:ring-2 focus:ring-move-green";
const labelClass = "text-sm font-medium text-move-navy";

export type ClientIntakeFields = {
  client_name: string | null;
  business_model: string | null;
  target_geography: string | null;
  avg_monthly_orders: number | null;
  peak_monthly_orders: number | null;
  latest_month_orders: number | null;
  avg_monthly_units: number | null;
  peak_monthly_units: number | null;
  benchmark_period: string | null;
  core_cost_categories: string | null;
  key_capability_needs: string | null;
  main_decision_focus: string | null;
  tech_integration_requirement: string | null;
  special_handling_requirement: string | null;
  fixed_comparison_principle: string | null;
  important_limitation: string | null;
  assumptions_data_limitations: string | null;
};

function TextField({
  name,
  label,
  defaultValue,
  placeholder,
  required,
  type = "text",
}: {
  name: string;
  label: string;
  defaultValue: string | number | null;
  placeholder?: string;
  required?: boolean;
  type?: "text" | "number";
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={name} className={labelClass}>
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        min={type === "number" ? "0" : undefined}
        step={type === "number" ? "1" : undefined}
        required={required}
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
}: {
  name: string;
  label: string;
  defaultValue: string | null;
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
        defaultValue={defaultValue ?? ""}
        className={fieldClass}
      />
    </div>
  );
}

function ChipInput({
  name,
  label,
  defaultValue,
}: {
  name: string;
  label: string;
  defaultValue: string | null;
}) {
  const [chips, setChips] = useState<string[]>(
    defaultValue
      ? defaultValue
          .split(",")
          .map((chip) => chip.trim())
          .filter(Boolean)
      : [],
  );
  const [inputValue, setInputValue] = useState("");

  function addChip() {
    const trimmed = inputValue.trim();
    if (trimmed && !chips.includes(trimmed)) {
      setChips([...chips, trimmed]);
    }
    setInputValue("");
  }

  function removeChip(chip: string) {
    setChips(chips.filter((c) => c !== chip));
  }

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={name} className={labelClass}>
        {label}
      </label>
      <div
        className={`flex flex-wrap items-center gap-1.5 ${fieldClass} focus-within:border-move-green focus-within:ring-2 focus-within:ring-move-green`}
      >
        {chips.map((chip) => (
          <span
            key={chip}
            className="flex items-center gap-1 rounded-full bg-neutral-bg px-2 py-0.5 text-xs text-move-navy"
          >
            {chip}
            <button
              type="button"
              onClick={() => removeChip(chip)}
              className="text-neutral-muted hover:text-danger"
              aria-label={`Remove ${chip}`}
            >
              ×
            </button>
          </span>
        ))}
        <input
          id={name}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addChip();
            }
          }}
          onBlur={addChip}
          placeholder={chips.length === 0 ? "Type and press Enter" : ""}
          className="min-w-32 flex-1 border-none p-0 text-sm text-move-navy placeholder:italic placeholder:text-gray-400 outline-none focus:ring-0"
        />
      </div>
      <input type="hidden" name={name} value={chips.join(", ")} />
    </div>
  );
}

export function ClientIntakeForm({
  clientRequirementId,
  defaultValues,
}: {
  clientRequirementId: string | null;
  defaultValues?: ClientIntakeFields;
}) {
  const [state, formAction, pending] = useActionState<
    SaveClientIntakeState,
    FormData
  >(
    async (_prevState, formData) =>
      saveClientIntake(clientRequirementId, formData),
    {},
  );

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField
          name="client_name"
          label="Client Name"
          defaultValue={defaultValues?.client_name ?? null}
          placeholder="e.g. Acme Corp"
          required
        />
        <TextField
          name="business_model"
          label="Business Model"
          defaultValue={defaultValues?.business_model ?? null}
          placeholder="e.g. B2C DTC"
        />
        <TextField
          name="target_geography"
          label="Target Geography"
          defaultValue={defaultValues?.target_geography ?? null}
          placeholder="e.g. Los Angeles, USA"
        />
        <TextField
          name="avg_monthly_orders"
          label="Average Monthly Orders"
          type="number"
          defaultValue={defaultValues?.avg_monthly_orders ?? null}
        />
        <TextField
          name="peak_monthly_orders"
          label="Peak Monthly Orders"
          type="number"
          defaultValue={defaultValues?.peak_monthly_orders ?? null}
        />
        <TextField
          name="latest_month_orders"
          label="Latest Month Orders"
          type="number"
          defaultValue={defaultValues?.latest_month_orders ?? null}
        />
        <TextField
          name="avg_monthly_units"
          label="Average Monthly Units"
          type="number"
          defaultValue={defaultValues?.avg_monthly_units ?? null}
        />
        <TextField
          name="peak_monthly_units"
          label="Peak Monthly Units"
          type="number"
          defaultValue={defaultValues?.peak_monthly_units ?? null}
        />
        <TextField
          name="benchmark_period"
          label="Benchmark Period"
          defaultValue={defaultValues?.benchmark_period ?? null}
          placeholder="e.g. Feb 1-15 2027"
        />
      </div>

      <ChipInput
        name="core_cost_categories"
        label="Core Cost Categories"
        defaultValue={defaultValues?.core_cost_categories ?? null}
      />
      <ChipInput
        name="key_capability_needs"
        label="Services Required"
        defaultValue={defaultValues?.key_capability_needs ?? null}
      />

      <TextAreaField
        name="main_decision_focus"
        label="Main Decision Focus"
        defaultValue={defaultValues?.main_decision_focus ?? null}
      />
      <TextAreaField
        name="tech_integration_requirement"
        label="Technology/Integration Requirement"
        defaultValue={defaultValues?.tech_integration_requirement ?? null}
      />
      <TextAreaField
        name="special_handling_requirement"
        label="Special Handling Requirement"
        defaultValue={defaultValues?.special_handling_requirement ?? null}
      />
      <TextAreaField
        name="fixed_comparison_principle"
        label="Fixed Comparison Principle"
        defaultValue={defaultValues?.fixed_comparison_principle ?? null}
      />
      <TextAreaField
        name="important_limitation"
        label="Important Limitation"
        defaultValue={defaultValues?.important_limitation ?? null}
      />
      <TextAreaField
        name="assumptions_data_limitations"
        label="Assumptions/Data Limitations"
        defaultValue={defaultValues?.assumptions_data_limitations ?? null}
      />

      {state.error && <p className="text-sm text-danger">{state.error}</p>}

      <div className="flex items-center gap-3">
        <Button
          type="submit"
          name="intent"
          value="continue"
          disabled={pending}
          className="px-4 py-2.5"
        >
          {pending ? "Saving..." : "Continue to Add 3PLs →"}
        </Button>
        <Button
          type="submit"
          name="intent"
          value="draft"
          variant="outline"
          disabled={pending}
          className="px-4 py-2.5"
        >
          Save Draft
        </Button>
      </div>
    </form>
  );
}

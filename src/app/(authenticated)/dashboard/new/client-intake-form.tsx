"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { saveClientIntake, type SaveClientIntakeState } from "./actions";

const fieldClass =
  "rounded-xl border border-neutral-border px-3 py-2 text-sm text-move-navy placeholder:italic placeholder:text-gray-400 focus:border-move-green focus:outline-none focus:ring-2 focus:ring-move-green";
const labelClass = "text-sm font-medium text-move-navy";

const CORE_COST_CATEGORY_PRESETS = [
  "Storage",
  "Pick & Pack",
  "Receiving",
  "Returns",
  "Kitting",
];

const KEY_CAPABILITY_PRESETS = [
  "Receiving",
  "Storage",
  "Fulfillment (Pick, Check, Pack)",
  "Dispatch",
  "Adhoc Kitting / Bundling",
  "Adhoc Labelling",
  "Returns",
  "Annual Inventory Count",
  "Cycle Count",
  "Inventory Count upon Request",
  "One Time System Set-up",
  "Lot / Batch / Expiry Tracking",
  "Temperature-Controlled Storage",
  "Retail / EDI Compliance",
  "Cross-Docking",
];

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

function PresetChipPicker({
  name,
  label,
  presets,
  defaultValue,
}: {
  name: string;
  label: string;
  presets: string[];
  defaultValue: string | null;
}) {
  const initialTokens = defaultValue
    ? defaultValue
        .split(",")
        .map((token) => token.trim())
        .filter(Boolean)
    : [];

  const [selectedPresets, setSelectedPresets] = useState<Set<string>>(
    new Set(initialTokens.filter((token) => presets.includes(token))),
  );
  const [customChips, setCustomChips] = useState<string[]>(
    initialTokens.filter((token) => !presets.includes(token)),
  );
  const [customInput, setCustomInput] = useState("");

  function togglePreset(option: string) {
    setSelectedPresets((prev) => {
      const next = new Set(prev);
      if (next.has(option)) {
        next.delete(option);
      } else {
        next.add(option);
      }
      return next;
    });
  }

  function addCustomChip() {
    const trimmed = customInput.trim();
    if (trimmed && !customChips.includes(trimmed) && !presets.includes(trimmed)) {
      setCustomChips([...customChips, trimmed]);
    }
    setCustomInput("");
  }

  function removeCustomChip(chip: string) {
    setCustomChips(customChips.filter((c) => c !== chip));
  }

  const value = [
    ...presets.filter((option) => selectedPresets.has(option)),
    ...customChips,
  ].join(", ");

  return (
    <div className="flex flex-col gap-2">
      <label className={labelClass}>{label}</label>

      <div className="flex flex-wrap gap-2">
        {presets.map((option) => {
          const isSelected = selectedPresets.has(option);
          return (
            <button
              key={option}
              type="button"
              onClick={() => togglePreset(option)}
              aria-pressed={isSelected}
              className={
                isSelected
                  ? "rounded-full bg-move-green px-3 py-1 text-xs font-medium text-white"
                  : "rounded-full border border-neutral-border px-3 py-1 text-xs font-medium text-move-navy hover:border-move-green"
              }
            >
              {option}
            </button>
          );
        })}
      </div>

      {customChips.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {customChips.map((chip) => (
            <span
              key={chip}
              className="flex items-center gap-1 rounded-full bg-neutral-bg px-2 py-0.5 text-xs text-move-navy"
            >
              {chip}
              <button
                type="button"
                onClick={() => removeCustomChip(chip)}
                className="text-neutral-muted hover:text-danger"
                aria-label={`Remove ${chip}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      <input
        type="text"
        value={customInput}
        onChange={(e) => setCustomInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            addCustomChip();
          }
        }}
        onBlur={addCustomChip}
        placeholder="+ Others — type and press Enter to add"
        className="w-full max-w-xs rounded-xl border border-neutral-border px-3 py-1.5 text-xs text-move-navy placeholder:italic placeholder:text-gray-400 focus:border-move-green focus:outline-none focus:ring-2 focus:ring-move-green"
      />

      <input type="hidden" name={name} value={value} />
    </div>
  );
}

export function ClientIntakeForm({
  clientRequirementId,
  defaultValues,
  backHref,
  backLabel,
}: {
  clientRequirementId: string | null;
  defaultValues?: ClientIntakeFields;
  backHref: string;
  backLabel: string;
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

      <PresetChipPicker
        name="core_cost_categories"
        label="Core Cost Categories"
        presets={CORE_COST_CATEGORY_PRESETS}
        defaultValue={defaultValues?.core_cost_categories ?? null}
      />
      <PresetChipPicker
        name="key_capability_needs"
        label="Services Required"
        presets={KEY_CAPABILITY_PRESETS}
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

      <div className="flex items-center justify-between gap-3">
        <Button
          type="button"
          variant="outline"
          nativeButton={false}
          render={<Link href={backHref} />}
          className="px-4 py-2.5"
        >
          {backLabel}
        </Button>

        <div className="flex items-center gap-3">
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
          <Button
            type="submit"
            name="intent"
            value="continue"
            disabled={pending}
            className="px-4 py-2.5"
          >
            {pending ? "Saving..." : "Continue to Add 3PLs →"}
          </Button>
        </div>
      </div>
    </form>
  );
}

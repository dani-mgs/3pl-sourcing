"use client";

import { useState } from "react";

const fieldClass =
  "rounded-xl border border-neutral-border px-3 py-2 text-sm text-move-navy placeholder:italic placeholder:text-gray-400 focus:border-move-green focus:outline-none focus:ring-2 focus:ring-move-green disabled:cursor-not-allowed disabled:bg-neutral-bg disabled:text-neutral-muted";
const labelClass = "text-sm font-medium text-move-navy";

const CORE_COST_CATEGORY_PRESETS = [
  "Storage",
  "Pick & Pack",
  "Receiving",
  "Returns",
  "Kitting",
];

// Preset/custom chip values are joined with "; " rather than "," because several
// preset labels (e.g. "Fulfillment (Pick, Check, Pack)") contain commas themselves,
// which would otherwise fragment on split. No preset or expected custom value
// contains a semicolon.
const CHIP_SEPARATOR = "; ";

function parseChipValue(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(";")
    .map((token) => token.trim())
    .filter(Boolean);
}

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
  disabled,
}: {
  name: string;
  label: string;
  defaultValue: string | number | null;
  placeholder?: string;
  required?: boolean;
  type?: "text" | "number";
  disabled?: boolean;
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
        disabled={disabled}
        className={fieldClass}
      />
    </div>
  );
}

function TextAreaField({
  name,
  label,
  defaultValue,
  disabled,
}: {
  name: string;
  label: string;
  defaultValue: string | null;
  disabled?: boolean;
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
        disabled={disabled}
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
  disabled,
}: {
  name: string;
  label: string;
  presets: string[];
  defaultValue: string | null;
  disabled?: boolean;
}) {
  const initialTokens = parseChipValue(defaultValue);

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
  ].join(CHIP_SEPARATOR);

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
              disabled={disabled}
              aria-pressed={isSelected}
              className={
                isSelected
                  ? "rounded-full bg-move-green px-3 py-1 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-70"
                  : "rounded-full border border-neutral-border px-3 py-1 text-xs font-medium text-move-navy hover:border-move-green disabled:cursor-not-allowed disabled:hover:border-neutral-border"
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
                disabled={disabled}
                className="text-neutral-muted hover:text-danger disabled:cursor-not-allowed"
                aria-label={`Remove ${chip}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {!disabled && (
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
      )}

      <input type="hidden" name={name} value={value} />
    </div>
  );
}

export function ClientIntakeFormFields({
  defaultValues,
  disabled,
}: {
  defaultValues?: ClientIntakeFields;
  disabled?: boolean;
}) {
  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField
          name="client_name"
          label="Client Name"
          defaultValue={defaultValues?.client_name ?? null}
          placeholder="e.g. Acme Corp"
          required
          disabled={disabled}
        />
        <TextField
          name="business_model"
          label="Business Model"
          defaultValue={defaultValues?.business_model ?? null}
          placeholder="e.g. B2C DTC"
          disabled={disabled}
        />
        <TextField
          name="target_geography"
          label="Target Geography"
          defaultValue={defaultValues?.target_geography ?? null}
          placeholder="e.g. Los Angeles, USA"
          disabled={disabled}
        />
        <TextField
          name="avg_monthly_orders"
          label="Average Monthly Orders"
          type="number"
          defaultValue={defaultValues?.avg_monthly_orders ?? null}
          disabled={disabled}
        />
        <TextField
          name="peak_monthly_orders"
          label="Peak Monthly Orders"
          type="number"
          defaultValue={defaultValues?.peak_monthly_orders ?? null}
          disabled={disabled}
        />
        <TextField
          name="latest_month_orders"
          label="Latest Month Orders"
          type="number"
          defaultValue={defaultValues?.latest_month_orders ?? null}
          disabled={disabled}
        />
        <TextField
          name="avg_monthly_units"
          label="Average Monthly Units"
          type="number"
          defaultValue={defaultValues?.avg_monthly_units ?? null}
          disabled={disabled}
        />
        <TextField
          name="peak_monthly_units"
          label="Peak Monthly Units"
          type="number"
          defaultValue={defaultValues?.peak_monthly_units ?? null}
          disabled={disabled}
        />
        <TextField
          name="benchmark_period"
          label="Benchmark Period"
          defaultValue={defaultValues?.benchmark_period ?? null}
          placeholder="e.g. Feb 1-15 2027"
          disabled={disabled}
        />
      </div>

      <PresetChipPicker
        name="core_cost_categories"
        label="Core Cost Categories"
        presets={CORE_COST_CATEGORY_PRESETS}
        defaultValue={defaultValues?.core_cost_categories ?? null}
        disabled={disabled}
      />
      <PresetChipPicker
        name="key_capability_needs"
        label="Services Required"
        presets={KEY_CAPABILITY_PRESETS}
        defaultValue={defaultValues?.key_capability_needs ?? null}
        disabled={disabled}
      />

      <TextAreaField
        name="main_decision_focus"
        label="Main Decision Focus"
        defaultValue={defaultValues?.main_decision_focus ?? null}
        disabled={disabled}
      />
      <TextAreaField
        name="tech_integration_requirement"
        label="Technology/Integration Requirement"
        defaultValue={defaultValues?.tech_integration_requirement ?? null}
        disabled={disabled}
      />
      <TextAreaField
        name="special_handling_requirement"
        label="Special Handling Requirement"
        defaultValue={defaultValues?.special_handling_requirement ?? null}
        disabled={disabled}
      />
      <TextAreaField
        name="fixed_comparison_principle"
        label="Fixed Comparison Principle"
        defaultValue={defaultValues?.fixed_comparison_principle ?? null}
        disabled={disabled}
      />
      <TextAreaField
        name="important_limitation"
        label="Important Limitation"
        defaultValue={defaultValues?.important_limitation ?? null}
        disabled={disabled}
      />
      <TextAreaField
        name="assumptions_data_limitations"
        label="Assumptions/Data Limitations"
        defaultValue={defaultValues?.assumptions_data_limitations ?? null}
        disabled={disabled}
      />
    </>
  );
}

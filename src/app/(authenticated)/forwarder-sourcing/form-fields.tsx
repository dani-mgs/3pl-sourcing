"use client";

import { useState, type ChangeEvent } from "react";

// Native inputs throughout: these fields are pre-filled from the server
// (AGENTS.md "Form Input Conventions"). Styling matches the 3PL forms.
export const fieldClass =
  "w-full rounded-xl border border-neutral-border bg-white px-3 py-2 text-sm text-move-navy placeholder:italic placeholder:text-gray-400 focus:border-move-green focus:outline-none focus:ring-2 focus:ring-move-green disabled:cursor-not-allowed disabled:bg-neutral-bg disabled:text-neutral-muted";
export const labelClass = "text-sm font-medium text-move-navy";

type Value = string | number | null | undefined;

export function InputField({
  name,
  label,
  defaultValue,
  type = "text",
  step,
}: {
  name: string;
  label: string;
  defaultValue: Value;
  type?: "text" | "number" | "date";
  step?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={name} className={labelClass}>
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        min={type === "number" ? "0" : undefined}
        step={step}
        inputMode={type === "number" ? "decimal" : undefined}
        defaultValue={defaultValue ?? ""}
        className={fieldClass}
      />
    </div>
  );
}

export function TextAreaField({
  name,
  label,
  defaultValue,
}: {
  name: string;
  label: string;
  defaultValue: Value;
}) {
  return (
    <div className="flex flex-col gap-2 sm:col-span-2">
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

// value/onChange make it controlled (used for the mode → type pairing);
// otherwise it's uncontrolled with defaultValue.
export function SelectField({
  name,
  label,
  options,
  defaultValue,
  value,
  onChange,
  placeholder = "Select…",
  disabled,
  hint,
}: {
  name: string;
  label: string;
  options: readonly string[];
  defaultValue?: Value;
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  hint?: string;
}) {
  const controlled = value !== undefined;
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={name} className={labelClass}>
        {label}
      </label>
      <select
        id={name}
        name={name}
        {...(controlled
          ? {
              value,
              onChange: (e: ChangeEvent<HTMLSelectElement>) =>
                onChange?.(e.target.value),
            }
          : { defaultValue: (defaultValue as string | null) ?? "" })}
        disabled={disabled}
        className={fieldClass}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      {hint && <p className="text-xs text-neutral-muted">{hint}</p>}
    </div>
  );
}

// Toggle chips for a fixed set of named booleans (e.g. the 11 forwarder
// capabilities) — each option is its own form field, always posted as
// "true"/"false", unlike MultiChipField's single array-valued field below.
export function BooleanChipsField({
  label,
  options,
  defaultValues,
}: {
  label: string;
  options: readonly { name: string; label: string }[];
  // Loosely typed since callers often pass a wider "all form fields" object
  // rather than one filtered to just these boolean keys.
  defaultValues?: Record<string, unknown>;
}) {
  const [values, setValues] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(options.map((o) => [o.name, Boolean(defaultValues?.[o.name])])),
  );

  return (
    <fieldset className="flex flex-col gap-2 sm:col-span-2">
      <legend className={`${labelClass} mb-2`}>{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const on = values[option.name];
          return (
            <button
              key={option.name}
              type="button"
              aria-pressed={on}
              onClick={() => setValues((prev) => ({ ...prev, [option.name]: !prev[option.name] }))}
              className={
                on
                  ? "rounded-full border border-move-green bg-move-green px-3 py-1 text-xs font-medium text-white"
                  : "rounded-full border border-neutral-border bg-white px-3 py-1 text-xs font-medium text-move-navy hover:border-move-green"
              }
            >
              {option.label}
            </button>
          );
        })}
      </div>
      {options.map((option) => (
        <input
          key={option.name}
          type="hidden"
          name={option.name}
          value={values[option.name] ? "true" : "false"}
        />
      ))}
    </fieldset>
  );
}

// Toggle chips posting one hidden input per selected option.
export function MultiChipField({
  name,
  label,
  options,
  defaultValue,
}: {
  name: string;
  label: string;
  options: readonly string[];
  defaultValue: readonly string[] | null | undefined;
}) {
  const [selected, setSelected] = useState<string[]>([...(defaultValue ?? [])]);

  return (
    <fieldset className="flex flex-col gap-2 sm:col-span-2">
      <legend className={`${labelClass} mb-2`}>{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const on = selected.includes(option);
          return (
            <button
              key={option}
              type="button"
              aria-pressed={on}
              onClick={() =>
                setSelected((prev) =>
                  on ? prev.filter((o) => o !== option) : [...prev, option],
                )
              }
              className={
                on
                  ? "rounded-full border border-move-green bg-move-green px-3 py-1 text-xs font-medium text-white"
                  : "rounded-full border border-neutral-border bg-white px-3 py-1 text-xs font-medium text-move-navy hover:border-move-green"
              }
            >
              {option}
            </button>
          );
        })}
      </div>
      {selected.map((option) => (
        <input key={option} type="hidden" name={name} value={option} />
      ))}
    </fieldset>
  );
}

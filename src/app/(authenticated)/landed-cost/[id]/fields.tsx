"use client";

import type { InputHTMLAttributes, ReactNode } from "react";
import { errorTextClass, fieldClass, hintClass, labelClass } from "../styles";

// Native inputs for the workspace editor (they hold saved data, so never the
// shadcn Input: AGENTS.md, form input conventions). Every input has a label
// with its unit, and its error is linked with aria-describedby.

export type FieldErrors = Record<string, string>;

export function describedBy(id: string, errors: FieldErrors, hint?: boolean): string | undefined {
  const ids = [errors[id] ? `${id}-error` : null, hint ? `${id}-hint` : null].filter(Boolean);
  return ids.length > 0 ? ids.join(" ") : undefined;
}

export function FieldError({ id, errors }: { id: string; errors: FieldErrors }) {
  if (!errors[id]) return null;
  return (
    <p id={`${id}-error`} className={errorTextClass}>
      {errors[id]}
    </p>
  );
}

export function Field({
  id,
  label,
  unit,
  hint,
  errors,
  children,
}: {
  id: string;
  label: string;
  unit?: string;
  hint?: ReactNode;
  errors: FieldErrors;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className={labelClass}>
        {label}
        {unit && <span className="font-normal text-neutral-muted"> ({unit})</span>}
      </label>
      {children}
      {hint && (
        <p id={`${id}-hint`} className={hintClass}>
          {hint}
        </p>
      )}
      <FieldError id={id} errors={errors} />
    </div>
  );
}

// A text input bound to one draft value. Numbers are typed as text and
// checked on the server: inputMode only picks the keyboard.
export function TextInput({
  id,
  value,
  onValue,
  errors,
  hint = false,
  numeric = false,
  className = fieldClass,
  ...rest
}: {
  id: string;
  value: string;
  onValue: (value: string) => void;
  errors: FieldErrors;
  hint?: boolean;
  numeric?: boolean;
  className?: string;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "value" | "onChange" | "className">) {
  return (
    <input
      id={id}
      value={value}
      onChange={(e) => onValue(e.target.value)}
      inputMode={numeric ? "decimal" : undefined}
      aria-invalid={errors[id] ? true : undefined}
      aria-describedby={describedBy(id, errors, hint)}
      className={`${className}${numeric ? " text-right tabular-nums" : ""}`}
      {...rest}
    />
  );
}

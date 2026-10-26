"use client";

import { useEffect, useState } from "react";
import type { FieldDef } from "@/lib/forwarder-audit/field-defs";
import { errorTextClass, fieldClass, hintClass, labelClass } from "../styles";

// Native inputs (they hold saved data, so never the shadcn Input: AGENTS.md,
// form input conventions). A number is typed as text and checked as it's
// typed; a value that isn't a number is reported through `onBad` and blocks
// saving, so a typo is never saved as an empty cell.

export type OnBad = (id: string, bad: boolean) => void;

const NUMBER = /^-?(\d+\.?\d*|\.\d+)$/;

export function NumberInput({
  id,
  label,
  value,
  onChange,
  onBad,
  scale = 1,
  className = fieldClass,
}: {
  id: string;
  label?: string;
  value: number | null;
  onChange: (value: number | null) => void;
  onBad: OnBad;
  scale?: number; // shown as value x scale (a tax rate of 0.08 as 8)
  className?: string;
}) {
  const [text, setText] = useState(value === null ? "" : String(Number((value * scale).toPrecision(12))));
  const [bad, setBad] = useState(false);
  useEffect(() => () => onBad(id, false), [id, onBad]);
  return (
    <>
      <input
        id={id}
        aria-label={label}
        type="text"
        inputMode="decimal"
        className={className}
        value={text}
        aria-invalid={bad || undefined}
        onChange={(e) => {
          const next = e.target.value;
          setText(next);
          const trimmed = next.trim();
          if (trimmed === "") {
            setBad(false);
            onBad(id, false);
            onChange(null);
          } else if (NUMBER.test(trimmed) && Math.abs(Number(trimmed)) < 1e12) {
            setBad(false);
            onBad(id, false);
            onChange(Number(trimmed) / scale);
          } else {
            setBad(true);
            onBad(id, true);
          }
        }}
      />
      {bad && <span className={errorTextClass}>Enter a number.</span>}
    </>
  );
}

export function SelectInput({
  id,
  label,
  value,
  options,
  onChange,
  className = fieldClass,
}: {
  id: string;
  label?: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <select id={id} aria-label={label} className={className} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value=""></option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

export function DateInput({ id, label, value, onChange, className = fieldClass }: { id: string; label?: string; value: string | null; onChange: (value: string | null) => void; className?: string }) {
  return <input id={id} aria-label={label} type="date" className={className} value={value ?? ""} onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)} />;
}

// One labelled field of section 1 or 2, from its definition.
export function FieldControl<T>({
  def,
  value,
  onChange,
  onBad,
}: {
  def: FieldDef<T>;
  value: string | number | null;
  onChange: (key: keyof T & string, value: string | number | null) => void;
  onBad: OnBad;
}) {
  const id = `fa-${def.key}`;
  const set = (v: string | number | null) => onChange(def.key, v);
  return (
    <div className={`flex flex-col gap-2 ${def.kind === "textarea" ? "md:col-span-2" : ""}`}>
      <label htmlFor={id} className={labelClass}>
        {def.label}
      </label>
      {def.kind === "number" ? (
        <NumberInput id={id} value={value as number | null} onChange={set} onBad={onBad} />
      ) : def.kind === "select" ? (
        <SelectInput id={id} value={value as string} options={def.options ?? []} onChange={set} />
      ) : def.kind === "date" ? (
        <DateInput id={id} value={value as string | null} onChange={set} />
      ) : def.kind === "textarea" ? (
        <textarea id={id} rows={2} className={fieldClass} value={value as string} onChange={(e) => set(e.target.value)} />
      ) : (
        <input id={id} type="text" className={fieldClass} value={value as string} onChange={(e) => set(e.target.value)} />
      )}
      {def.hint && <p className={hintClass}>{def.hint}</p>}
    </div>
  );
}

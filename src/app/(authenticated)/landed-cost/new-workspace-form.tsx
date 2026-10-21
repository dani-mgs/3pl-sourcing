"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createWorkspaceAction } from "./actions";
import { ENTRY_TYPE_HINT, INCOTERMS, MODE_LABELS } from "./options";
import { errorTextClass, fieldClass, hintClass, labelClass, primaryButtonClass } from "./styles";

// A new workspace with its one origin scenario. The scenario is labelled
// with the country's name; freight is entered on the workspace page.
export function NewWorkspaceForm({
  countries,
  today,
  bounds,
}: {
  countries: readonly { code: string; name: string }[];
  today: string;
  bounds: { min: string; max: string };
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const value = (name: string) => String(form.get(name) ?? "");
    const origin = value("originCountry");
    startTransition(async () => {
      setError(null);
      const result = await createWorkspaceAction({
        name: value("name"),
        entryDate: value("entryDate"),
        scenario: {
          label: countries.find((c) => c.code === origin)?.name ?? origin,
          originCountry: origin,
          supplierName: value("supplierName"),
          incoterm: value("incoterm"),
          shipmentMode: value("shipmentMode"),
          entryType: value("entryType"),
          freightTotalUsd: "",
          freightBasis: "chargeable_weight",
          volumetricDivisor: "",
        },
      });
      if (result.ok) router.push(`/landed-cost/${result.workspaceId}`);
      else setError(result.error);
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-2">
        <label htmlFor="new-name" className={labelClass}>
          Name
        </label>
        <input id="new-name" name="name" required maxLength={120} className={fieldClass} placeholder="e.g. Q4 mugs, Ningbo" />
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="new-entryDate" className={labelClass}>
          Expected entry date
        </label>
        <input id="new-entryDate" name="entryDate" type="date" required defaultValue={today} min={bounds.min} max={bounds.max} className={fieldClass} />
        <p className={hintClass}>The day the goods enter the US: duty rates and fees in force on that day apply.</p>
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="new-originCountry" className={labelClass}>
          Country of origin
        </label>
        <select id="new-originCountry" name="originCountry" required defaultValue="" className={fieldClass}>
          <option value="" disabled>
            Choose a country
          </option>
          {countries.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="new-supplierName" className={labelClass}>
          Supplier <span className="font-normal text-neutral-muted">(optional)</span>
        </label>
        <input id="new-supplierName" name="supplierName" maxLength={120} className={fieldClass} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <label htmlFor="new-shipmentMode" className={labelClass}>
            Mode
          </label>
          <select id="new-shipmentMode" name="shipmentMode" defaultValue="Sea" className={fieldClass}>
            {Object.entries(MODE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="new-incoterm" className={labelClass}>
            Incoterm
          </label>
          <select id="new-incoterm" name="incoterm" defaultValue="FOB" className={fieldClass}>
            {INCOTERMS.map((term) => (
              <option key={term} value={term}>
                {term}
              </option>
            ))}
          </select>
        </div>
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className={`${labelClass} mb-2`}>Entry type</legend>
        <label className="flex items-center gap-2 text-sm text-move-navy">
          <input type="radio" name="entryType" value="auto" defaultChecked className="accent-move-green" /> Automatic
        </label>
        <label className="flex items-center gap-2 text-sm text-move-navy">
          <input type="radio" name="entryType" value="formal" className="accent-move-green" /> Formal
        </label>
        <p className={hintClass}>{ENTRY_TYPE_HINT}</p>
      </fieldset>
      {error && (
        <p className={errorTextClass} role="alert">
          {error}
        </p>
      )}
      <button type="submit" className={primaryButtonClass} disabled={isPending}>
        {isPending ? "Creating…" : "Create workspace"}
      </button>
    </form>
  );
}

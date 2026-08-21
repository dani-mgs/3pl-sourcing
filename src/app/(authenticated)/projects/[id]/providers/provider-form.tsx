"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

const STATUS_OPTIONS = [
  "Potential",
  "Contacted",
  "Discovery Call",
  "Quotation Received",
  "Negotiation",
  "Vetted",
  "Rejected",
];

const COUNTRY_CODES = [
  { code: "+1", label: "+1 (US/CA)" },
  { code: "+44", label: "+44 (UK)" },
  { code: "+61", label: "+61 (AU)" },
  { code: "+63", label: "+63 (PH)" },
  { code: "+65", label: "+65 (SG)" },
  { code: "+91", label: "+91 (IN)" },
  { code: "+971", label: "+971 (UAE)" },
];

function splitPhone(phone: string | null | undefined) {
  if (!phone) return { countryCode: "+1", digits: "" };
  const match = COUNTRY_CODES.find((c) => phone.startsWith(c.code));
  if (match) {
    return {
      countryCode: match.code,
      digits: phone.slice(match.code.length).replace(/\D/g, ""),
    };
  }
  return { countryCode: "+1", digits: phone.replace(/\D/g, "") };
}

const fieldClass =
  "rounded-xl border border-neutral-border px-3 py-2 text-sm text-move-navy placeholder:italic placeholder:text-gray-400 focus:border-move-green focus:outline-none focus:ring-2 focus:ring-move-green";
const labelClass = "text-sm font-medium text-move-navy";
const fieldErrorClass = "text-xs text-danger";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ProviderFormDefaults = {
  company_name: string;
  website: string;
  contact_person: string;
  email: string;
  phone: string;
  location: string;
  notes: string;
  status: string;
};

export function ProviderForm({
  formAction,
  pending,
  error,
  defaultValues,
  submitLabel,
  pendingLabel,
}: {
  formAction: (formData: FormData) => void;
  pending: boolean;
  error?: string;
  defaultValues?: ProviderFormDefaults;
  submitLabel: string;
  pendingLabel: string;
}) {
  const { countryCode: defaultCountryCode, digits: defaultDigits } =
    splitPhone(defaultValues?.phone);

  const [companyNameError, setCompanyNameError] = useState<string | null>(
    null,
  );
  const [emailError, setEmailError] = useState<string | null>(null);
  const [phoneDigits, setPhoneDigits] = useState(defaultDigits);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="company_name" className={labelClass}>
          Company Name
        </label>
        <input
          id="company_name"
          name="company_name"
          type="text"
          required
          placeholder="e.g. Acme Logistics"
          defaultValue={defaultValues?.company_name}
          className={fieldClass}
          onBlur={(e) =>
            setCompanyNameError(
              e.target.value.trim() ? null : "Company name is required",
            )
          }
        />
        {companyNameError && (
          <p className={fieldErrorClass}>{companyNameError}</p>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="website" className={labelClass}>
          Website
        </label>
        <input
          id="website"
          name="website"
          type="text"
          placeholder="e.g. acmelogistics.com"
          defaultValue={defaultValues?.website}
          className={fieldClass}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="contact_person" className={labelClass}>
          Contact Person
        </label>
        <input
          id="contact_person"
          name="contact_person"
          type="text"
          placeholder="e.g. Jane Smith"
          defaultValue={defaultValues?.contact_person}
          className={fieldClass}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="email" className={labelClass}>
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          placeholder="e.g. jane@acmelogistics.com"
          defaultValue={defaultValues?.email}
          className={fieldClass}
          onBlur={(e) => {
            const value = e.target.value.trim();
            setEmailError(
              value && !EMAIL_PATTERN.test(value)
                ? "Enter a valid email"
                : null,
            );
          }}
        />
        {emailError && <p className={fieldErrorClass}>{emailError}</p>}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="phone_number" className={labelClass}>
          Phone
        </label>
        <div className="flex gap-2">
          <select
            id="phone_country"
            name="phone_country"
            defaultValue={defaultCountryCode}
            className={`${fieldClass} w-32 shrink-0`}
          >
            {COUNTRY_CODES.map((country) => (
              <option key={country.code} value={country.code}>
                {country.label}
              </option>
            ))}
          </select>
          <input
            id="phone_number"
            name="phone_number"
            type="text"
            inputMode="numeric"
            value={phoneDigits}
            onChange={(e) =>
              setPhoneDigits(e.target.value.replace(/\D/g, ""))
            }
            className={`${fieldClass} flex-1`}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="location" className={labelClass}>
          Location
        </label>
        <input
          id="location"
          name="location"
          type="text"
          placeholder="e.g. Los Angeles, USA"
          defaultValue={defaultValues?.location}
          className={fieldClass}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="notes" className={labelClass}>
          Notes
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={3}
          defaultValue={defaultValues?.notes}
          className={fieldClass}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="status" className={labelClass}>
          Status
        </label>
        <select
          id="status"
          name="status"
          defaultValue={defaultValues?.status ?? "Potential"}
          className={fieldClass}
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <Button type="submit" disabled={pending} className="mt-2 px-4 py-2.5">
        {pending ? pendingLabel : submitLabel}
      </Button>
    </form>
  );
}

"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  STATUS_DOT_COLORS,
  ASSESSMENT_DOT_COLORS,
  type ProviderStatus,
  type AssessmentStatus,
} from "@/app/(authenticated)/projects/[id]/providers/status-badge";

export const STATUS_OPTIONS: ProviderStatus[] = [
  "Potential / Not Contacted",
  "Baseline",
  "Contacted",
  "Client Requirements Sent",
  "Scheduled for Discovery Call",
  "Waiting for Quotation",
  "Reviewing Quotation",
  "Clarifications",
  "Negotiation",
  "Shortlisted",
  "Vetted",
  "Unfit",
  "Do not Contact",
  "Withdrawn / No Response",
  "Completed / Closed",
];

export const ASSESSMENT_OPTIONS: AssessmentStatus[] = [
  "Under Assessment",
  "Move Recommended",
  "Fit",
  "Unfit",
  "Awarded/Approved",
];

export const COUNTRY_CODES = [
  { code: "+1", label: "+1 (US/CA)" },
  { code: "+44", label: "+44 (UK)" },
  { code: "+61", label: "+61 (AU)" },
  { code: "+63", label: "+63 (PH)" },
  { code: "+65", label: "+65 (SG)" },
  { code: "+91", label: "+91 (IN)" },
  { code: "+971", label: "+971 (UAE)" },
];

const COUNTRY_CODE_ITEMS = COUNTRY_CODES.map((country) => ({
  value: country.code,
  label: country.label,
}));

export function splitPhone(phone: string | null | undefined) {
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

const CAPABILITY_FIELDS: { name: string; label: string }[] = [
  { name: "receiving", label: "Receiving" },
  { name: "storage", label: "Storage" },
  { name: "fulfillment", label: "Fulfillment" },
  { name: "dispatch", label: "Dispatch" },
  { name: "adhoc_kitting_bundling", label: "Ad-hoc Kitting/Bundling" },
  { name: "adhoc_labelling", label: "Ad-hoc Labelling" },
  { name: "returns", label: "Returns" },
  { name: "annual_inventory_count", label: "Annual Inventory Count" },
  { name: "cycle_count", label: "Cycle Count" },
  {
    name: "inventory_count_on_request",
    label: "Inventory Count on Request",
  },
  { name: "one_time_system_setup", label: "One-Time System Setup" },
  {
    name: "lot_batch_expiry_tracking",
    label: "Lot/Batch Expiry Tracking",
  },
  { name: "temp_controlled_storage", label: "Temp-Controlled Storage" },
  { name: "retail_edi_compliance", label: "Retail EDI Compliance" },
  { name: "cross_docking", label: "Cross Docking" },
  { name: "b2b", label: "B2B" },
  { name: "b2c", label: "B2C" },
];

const fieldClass =
  "rounded-xl border border-neutral-border px-3 py-2 text-sm text-move-navy placeholder:italic placeholder:text-gray-400 focus:border-move-green focus:outline-none focus:ring-2 focus:ring-move-green";
const labelClass = "text-sm font-medium text-move-navy";
const fieldErrorClass = "text-xs text-danger";
const sectionTitleClass = "font-display text-lg font-semibold text-move-navy";
const checkboxLabelClass = "flex items-center gap-2 text-sm text-move-navy";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ProviderFormDefaults = {
  company_name: string | null;
  provider_type: string | null;
  website: string | null;
  location: string | null;
  footprint_source: string | null;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  receiving: boolean;
  storage: boolean;
  fulfillment: boolean;
  dispatch: boolean;
  adhoc_kitting_bundling: boolean;
  adhoc_labelling: boolean;
  returns: boolean;
  annual_inventory_count: boolean;
  cycle_count: boolean;
  inventory_count_on_request: boolean;
  one_time_system_setup: boolean;
  lot_batch_expiry_tracking: boolean;
  temp_controlled_storage: boolean;
  retail_edi_compliance: boolean;
  cross_docking: boolean;
  b2b: boolean;
  b2c: boolean;
  onboarding_period_months: number | null;
  virtual_tour_url: string | null;
  billing_terms: string | null;
  other_specialization: string | null;
  is_incumbent: boolean;
  storage_cost: number | null;
  pick_pack_cost: number | null;
  receiving_cost: number | null;
  returns_cost: number | null;
  status: string | null;
  assessment_status: string | null;
  key_strength: string | null;
  key_weakness_risk: string | null;
  important_assumption: string | null;
  overall_assessment: string | null;
  client_decision: string | null;
  source_basis: string | null;
  next_action: string | null;
  key_notes: string | null;
  notes: string | null;
};

function CapabilityChips({
  defaultValues,
}: {
  defaultValues?: ProviderFormDefaults;
}) {
  const [values, setValues] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      CAPABILITY_FIELDS.map((capability) => [
        capability.name,
        Boolean(
          defaultValues?.[capability.name as keyof ProviderFormDefaults],
        ),
      ]),
    ),
  );

  function toggle(name: string) {
    setValues((prev) => ({ ...prev, [name]: !prev[name] }));
  }

  // The browser's native reset (run by React after a `<form action>` call
  // finishes, success or error) can silently revert each hidden input's
  // submitted `.value` back to whatever it was at mount, even though the
  // visible chip — driven purely by `values` above — still looks correct.
  // Force every hidden input back in sync with `values` after each render
  // so a later real submission never sends stale capability data.
  const hiddenInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  useEffect(() => {
    for (const capability of CAPABILITY_FIELDS) {
      const node = hiddenInputRefs.current[capability.name];
      if (node) {
        node.value = values[capability.name] ? "true" : "false";
      }
    }
  });

  return (
    <div className="flex flex-wrap gap-2">
      {CAPABILITY_FIELDS.map((capability) => {
        const isSelected = values[capability.name];
        return (
          <div key={capability.name}>
            <button
              type="button"
              onClick={() => toggle(capability.name)}
              aria-pressed={isSelected}
              className={
                isSelected
                  ? "rounded-full bg-move-green px-3 py-1 text-xs font-medium text-white"
                  : "rounded-full border border-neutral-border px-3 py-1 text-xs font-medium text-move-navy hover:border-move-green"
              }
            >
              {capability.label}
            </button>
            <input
              ref={(node) => {
                hiddenInputRefs.current[capability.name] = node;
              }}
              type="hidden"
              name={capability.name}
              value={isSelected ? "true" : "false"}
            />
          </div>
        );
      })}
    </div>
  );
}

type FormFieldValues = {
  company_name: string;
  provider_type: string;
  website: string;
  location: string;
  footprint_source: string;
  contact_person: string;
  email: string;
  onboarding_period_months: string;
  virtual_tour_url: string;
  billing_terms: string;
  other_specialization: string;
  is_incumbent: boolean;
  storage_cost: string;
  pick_pack_cost: string;
  receiving_cost: string;
  returns_cost: string;
  status: string;
  assessment_status: string;
  key_strength: string;
  key_weakness_risk: string;
  important_assumption: string;
  overall_assessment: string;
  client_decision: string;
  source_basis: string;
  next_action: string;
  key_notes: string;
  notes: string;
};

function initialFieldValues(
  defaultValues?: ProviderFormDefaults,
): FormFieldValues {
  return {
    company_name: defaultValues?.company_name ?? "",
    provider_type: defaultValues?.provider_type ?? "",
    website: defaultValues?.website ?? "",
    location: defaultValues?.location ?? "",
    footprint_source: defaultValues?.footprint_source ?? "",
    contact_person: defaultValues?.contact_person ?? "",
    email: defaultValues?.email ?? "",
    onboarding_period_months:
      defaultValues?.onboarding_period_months != null
        ? String(defaultValues.onboarding_period_months)
        : "",
    virtual_tour_url: defaultValues?.virtual_tour_url ?? "",
    billing_terms: defaultValues?.billing_terms ?? "",
    other_specialization: defaultValues?.other_specialization ?? "",
    is_incumbent: Boolean(defaultValues?.is_incumbent),
    storage_cost:
      defaultValues?.storage_cost != null
        ? String(defaultValues.storage_cost)
        : "",
    pick_pack_cost:
      defaultValues?.pick_pack_cost != null
        ? String(defaultValues.pick_pack_cost)
        : "",
    receiving_cost:
      defaultValues?.receiving_cost != null
        ? String(defaultValues.receiving_cost)
        : "",
    returns_cost:
      defaultValues?.returns_cost != null
        ? String(defaultValues.returns_cost)
        : "",
    status: defaultValues?.status ?? "Potential / Not Contacted",
    assessment_status: defaultValues?.assessment_status ?? "",
    key_strength: defaultValues?.key_strength ?? "",
    key_weakness_risk: defaultValues?.key_weakness_risk ?? "",
    important_assumption: defaultValues?.important_assumption ?? "",
    overall_assessment: defaultValues?.overall_assessment ?? "",
    client_decision: defaultValues?.client_decision ?? "",
    source_basis: defaultValues?.source_basis ?? "",
    next_action: defaultValues?.next_action ?? "",
    key_notes: defaultValues?.key_notes ?? "",
    notes: defaultValues?.notes ?? "",
  };
}

export function ProviderForm({
  formAction,
  pending,
  error,
  defaultValues,
  submitLabel,
  pendingLabel,
  formRef,
}: {
  formAction: (formData: FormData) => void;
  pending: boolean;
  error?: string;
  defaultValues?: ProviderFormDefaults;
  submitLabel: string;
  pendingLabel: string;
  formRef?: RefObject<HTMLFormElement | null>;
}) {
  const { countryCode: defaultCountryCode, digits: defaultDigits } =
    splitPhone(defaultValues?.phone);

  const [companyNameError, setCompanyNameError] = useState<string | null>(
    null,
  );
  const [emailError, setEmailError] = useState<string | null>(null);
  const [phoneDigits, setPhoneDigits] = useState(defaultDigits);
  const [phoneCountry, setPhoneCountry] = useState(defaultCountryCode);

  // Every field below is controlled (rather than native `defaultValue`)
  // because React resets uncontrolled form elements after any `<form action>`
  // function finishes — success or error — which would otherwise wipe
  // everything the user typed when e.g. the incumbent-conflict error returns.
  const [values, setValues] = useState<FormFieldValues>(() =>
    initialFieldValues(defaultValues),
  );

  function updateField<K extends keyof FormFieldValues>(
    key: K,
    value: FormFieldValues[K],
  ) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  // React's built-in resync of controlled props is skipped when a value is
  // unchanged from the previous render, so the native reset the browser runs
  // after a `<form action>` call finishes (success or error) can silently
  // desync this checkbox's own DOM `.checked` — which FormData reads directly
  // — from `values.is_incumbent`. Force it back into sync after every render.
  const incumbentRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (incumbentRef.current) {
      incumbentRef.current.checked = values.is_incumbent;
    }
  });

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-8">
      <section className="flex flex-col gap-4">
        <h3 className={sectionTitleClass}>Company Info</h3>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
              value={values.company_name}
              onChange={(e) => updateField("company_name", e.target.value)}
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
            <label htmlFor="provider_type" className={labelClass}>
              3PL Type
            </label>
            <input
              id="provider_type"
              name="provider_type"
              type="text"
              placeholder="e.g. Asset-based 3PL"
              value={values.provider_type}
              onChange={(e) => updateField("provider_type", e.target.value)}
              className={fieldClass}
            />
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
              value={values.website}
              onChange={(e) => updateField("website", e.target.value)}
              className={fieldClass}
            />
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
              value={values.location}
              onChange={(e) => updateField("location", e.target.value)}
              className={fieldClass}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="footprint_source" className={labelClass}>
              Footprint Source
            </label>
            <input
              id="footprint_source"
              name="footprint_source"
              type="text"
              placeholder="e.g. Owned warehouse network"
              value={values.footprint_source}
              onChange={(e) =>
                updateField("footprint_source", e.target.value)
              }
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
              value={values.contact_person}
              onChange={(e) => updateField("contact_person", e.target.value)}
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
              value={values.email}
              onChange={(e) => updateField("email", e.target.value)}
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
              <Select
                name="phone_country"
                items={COUNTRY_CODE_ITEMS}
                value={phoneCountry}
                onValueChange={(value) => setPhoneCountry(value as string)}
              >
                <SelectTrigger
                  id="phone_country"
                  className="w-40 shrink-0 rounded-xl border-neutral-border"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COUNTRY_CODES.map((country) => (
                    <SelectItem key={country.code} value={country.code}>
                      {country.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h3 className={sectionTitleClass}>Capabilities</h3>
        <CapabilityChips defaultValues={defaultValues} />
      </section>

      <section className="flex flex-col gap-4">
        <h3 className={sectionTitleClass}>Commercial Terms</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label htmlFor="onboarding_period_months" className={labelClass}>
              Onboarding Period (months)
            </label>
            <input
              id="onboarding_period_months"
              name="onboarding_period_months"
              type="number"
              min="0"
              step="1"
              value={values.onboarding_period_months}
              onChange={(e) =>
                updateField("onboarding_period_months", e.target.value)
              }
              className={fieldClass}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="virtual_tour_url" className={labelClass}>
              Virtual Tour URL
            </label>
            <input
              id="virtual_tour_url"
              name="virtual_tour_url"
              type="url"
              placeholder="e.g. https://acmelogistics.com/tour"
              value={values.virtual_tour_url}
              onChange={(e) =>
                updateField("virtual_tour_url", e.target.value)
              }
              className={fieldClass}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="billing_terms" className={labelClass}>
              Billing Terms
            </label>
            <input
              id="billing_terms"
              name="billing_terms"
              type="text"
              placeholder="e.g. Net 30"
              value={values.billing_terms}
              onChange={(e) => updateField("billing_terms", e.target.value)}
              className={fieldClass}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="other_specialization" className={labelClass}>
              Other Specialization
            </label>
            <input
              id="other_specialization"
              name="other_specialization"
              type="text"
              value={values.other_specialization}
              onChange={(e) =>
                updateField("other_specialization", e.target.value)
              }
              className={fieldClass}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className={checkboxLabelClass}>
            <input
              ref={incumbentRef}
              type="checkbox"
              name="is_incumbent"
              value="true"
              checked={values.is_incumbent}
              onChange={(e) =>
                updateField("is_incumbent", e.target.checked)
              }
              className="size-4 rounded border-neutral-border text-move-green focus:ring-move-green"
            />
            Incumbent
          </label>
          <p className="text-xs text-neutral-muted">
            Only one incumbent allowed per client
          </p>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h3 className={sectionTitleClass}>Costs (USD)</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label htmlFor="storage_cost" className={labelClass}>
              Storage Cost
            </label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-neutral-muted">$</span>
              <input
                id="storage_cost"
                name="storage_cost"
                type="number"
                min="0"
                step="0.01"
                value={values.storage_cost}
                onChange={(e) => updateField("storage_cost", e.target.value)}
                className={`${fieldClass} flex-1`}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="pick_pack_cost" className={labelClass}>
              Pick &amp; Pack Cost
            </label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-neutral-muted">$</span>
              <input
                id="pick_pack_cost"
                name="pick_pack_cost"
                type="number"
                min="0"
                step="0.01"
                value={values.pick_pack_cost}
                onChange={(e) =>
                  updateField("pick_pack_cost", e.target.value)
                }
                className={`${fieldClass} flex-1`}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="receiving_cost" className={labelClass}>
              Receiving Cost
            </label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-neutral-muted">$</span>
              <input
                id="receiving_cost"
                name="receiving_cost"
                type="number"
                min="0"
                step="0.01"
                value={values.receiving_cost}
                onChange={(e) =>
                  updateField("receiving_cost", e.target.value)
                }
                className={`${fieldClass} flex-1`}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="returns_cost" className={labelClass}>
              Returns Cost
            </label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-neutral-muted">$</span>
              <input
                id="returns_cost"
                name="returns_cost"
                type="number"
                min="0"
                step="0.01"
                value={values.returns_cost}
                onChange={(e) => updateField("returns_cost", e.target.value)}
                className={`${fieldClass} flex-1`}
              />
            </div>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h3 className={sectionTitleClass}>Status &amp; Assessment</h3>

        <div className="flex flex-col gap-1">
          <label htmlFor="status" className={labelClass}>
            Status
          </label>
          <Select
            name="status"
            value={values.status}
            onValueChange={(value) => updateField("status", value as string)}
          >
            <SelectTrigger id="status" className="w-full rounded-xl border-neutral-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((option) => (
                <SelectItem key={option} value={option}>
                  <span
                    className={`inline-block size-2 shrink-0 rounded-full ${STATUS_DOT_COLORS[option]}`}
                  />
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="assessment_status" className={labelClass}>
            Assessment
          </label>
          <Select
            name="assessment_status"
            value={values.assessment_status || null}
            onValueChange={(value) =>
              updateField("assessment_status", (value as string) ?? "")
            }
          >
            <SelectTrigger id="assessment_status" className="w-full rounded-xl border-neutral-border">
              <SelectValue placeholder="Select an assessment" />
            </SelectTrigger>
            <SelectContent>
              {ASSESSMENT_OPTIONS.map((option) => (
                <SelectItem key={option} value={option}>
                  <span
                    className={`inline-block size-2 shrink-0 rounded-full ${ASSESSMENT_DOT_COLORS[option]}`}
                  />
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="key_strength" className={labelClass}>
            Key Strength
          </label>
          <textarea
            id="key_strength"
            name="key_strength"
            rows={2}
            value={values.key_strength}
            onChange={(e) => updateField("key_strength", e.target.value)}
            className={fieldClass}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="key_weakness_risk" className={labelClass}>
            Key Weakness / Risk
          </label>
          <textarea
            id="key_weakness_risk"
            name="key_weakness_risk"
            rows={2}
            value={values.key_weakness_risk}
            onChange={(e) =>
              updateField("key_weakness_risk", e.target.value)
            }
            className={fieldClass}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="important_assumption" className={labelClass}>
            Important Assumption
          </label>
          <textarea
            id="important_assumption"
            name="important_assumption"
            rows={2}
            value={values.important_assumption}
            onChange={(e) =>
              updateField("important_assumption", e.target.value)
            }
            className={fieldClass}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="overall_assessment" className={labelClass}>
            Overall Assessment
          </label>
          <textarea
            id="overall_assessment"
            name="overall_assessment"
            rows={2}
            value={values.overall_assessment}
            onChange={(e) =>
              updateField("overall_assessment", e.target.value)
            }
            className={fieldClass}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="client_decision" className={labelClass}>
            Client Decision
          </label>
          <input
            id="client_decision"
            name="client_decision"
            type="text"
            value={values.client_decision}
            onChange={(e) => updateField("client_decision", e.target.value)}
            className={fieldClass}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="source_basis" className={labelClass}>
            Source / Basis
          </label>
          <input
            id="source_basis"
            name="source_basis"
            type="text"
            value={values.source_basis}
            onChange={(e) => updateField("source_basis", e.target.value)}
            className={fieldClass}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="next_action" className={labelClass}>
            Next Action
          </label>
          <input
            id="next_action"
            name="next_action"
            type="text"
            value={values.next_action}
            onChange={(e) => updateField("next_action", e.target.value)}
            className={fieldClass}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="key_notes" className={labelClass}>
            Key Notes
          </label>
          <textarea
            id="key_notes"
            name="key_notes"
            rows={2}
            value={values.key_notes}
            onChange={(e) => updateField("key_notes", e.target.value)}
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
            value={values.notes}
            onChange={(e) => updateField("notes", e.target.value)}
            className={fieldClass}
          />
        </div>
      </section>

      {error && <p className="text-sm text-danger">{error}</p>}

      <Button type="submit" disabled={pending} className="self-start px-4 py-2.5">
        {pending ? pendingLabel : submitLabel}
      </Button>
    </form>
  );
}

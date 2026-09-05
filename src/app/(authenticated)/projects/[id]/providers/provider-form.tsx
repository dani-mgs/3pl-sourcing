"use client";

import { useState } from "react";
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
} from "./status-badge";

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
    <form action={formAction} className="flex flex-col gap-8">
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
              defaultValue={defaultValues?.company_name ?? ""}
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
              Provider Type
            </label>
            <input
              id="provider_type"
              name="provider_type"
              type="text"
              placeholder="e.g. Asset-based 3PL"
              defaultValue={defaultValues?.provider_type ?? ""}
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
              defaultValue={defaultValues?.website ?? ""}
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
              defaultValue={defaultValues?.location ?? ""}
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
              defaultValue={defaultValues?.footprint_source ?? ""}
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
              defaultValue={defaultValues?.contact_person ?? ""}
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
              defaultValue={defaultValues?.email ?? ""}
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
                defaultValue={defaultCountryCode}
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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
          {CAPABILITY_FIELDS.map((capability) => (
            <label key={capability.name} className={checkboxLabelClass}>
              <input
                type="checkbox"
                name={capability.name}
                value="true"
                defaultChecked={Boolean(
                  defaultValues?.[
                    capability.name as keyof ProviderFormDefaults
                  ],
                )}
                className="size-4 rounded border-neutral-border text-move-green focus:ring-move-green"
              />
              {capability.label}
            </label>
          ))}
        </div>
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
              defaultValue={defaultValues?.onboarding_period_months ?? ""}
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
              defaultValue={defaultValues?.virtual_tour_url ?? ""}
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
              defaultValue={defaultValues?.billing_terms ?? ""}
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
              defaultValue={defaultValues?.other_specialization ?? ""}
              className={fieldClass}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className={checkboxLabelClass}>
            <input
              type="checkbox"
              name="is_incumbent"
              value="true"
              defaultChecked={Boolean(defaultValues?.is_incumbent)}
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
                defaultValue={defaultValues?.storage_cost ?? ""}
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
                defaultValue={defaultValues?.pick_pack_cost ?? ""}
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
                defaultValue={defaultValues?.receiving_cost ?? ""}
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
                defaultValue={defaultValues?.returns_cost ?? ""}
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
            defaultValue={defaultValues?.status ?? "Potential / Not Contacted"}
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
            defaultValue={defaultValues?.assessment_status ?? undefined}
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
            defaultValue={defaultValues?.key_strength ?? ""}
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
            defaultValue={defaultValues?.key_weakness_risk ?? ""}
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
            defaultValue={defaultValues?.important_assumption ?? ""}
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
            defaultValue={defaultValues?.overall_assessment ?? ""}
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
            defaultValue={defaultValues?.client_decision ?? ""}
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
            defaultValue={defaultValues?.source_basis ?? ""}
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
            defaultValue={defaultValues?.next_action ?? ""}
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
            defaultValue={defaultValues?.key_notes ?? ""}
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
            defaultValue={defaultValues?.notes ?? ""}
            className={fieldClass}
          />
        </div>
      </section>

      {error && <p className="text-sm text-danger">{error}</p>}

      <Button type="submit" disabled={pending} className="px-4 py-2.5">
        {pending ? pendingLabel : submitLabel}
      </Button>
    </form>
  );
}

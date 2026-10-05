import { LEGAL_STATUS_LABELS } from "@/lib/tariff/additional-duties";
import { LEGAL_STATUSES } from "@/lib/tariff/parse-duty-data-forms";
import type { ProgramDutyRow } from "@/lib/tariff/server-duty-admin";
import { ActionForm } from "../action-form";
import { addDuty, endDateDuty, updateDutyDetails } from "../actions";

// Native inputs: these forms are pre-filled from server data (AGENTS.md).
const fieldClass =
  "w-full rounded-xl border border-neutral-border bg-white px-3 py-2 text-sm text-move-navy placeholder:italic placeholder:text-gray-400 focus:border-move-green focus:outline-none focus:ring-2 focus:ring-move-green";
const labelClass = "flex flex-col gap-1.5 text-sm font-medium text-move-navy";
const hintClass = "text-xs font-normal text-neutral-muted";

function LegalStatusSelect({ defaultValue }: { defaultValue: string }) {
  return (
    <select name="legal_status" defaultValue={defaultValue} className={fieldClass}>
      {LEGAL_STATUSES.map((s) => (
        <option key={s} value={s}>
          {LEGAL_STATUS_LABELS[s]}
        </option>
      ))}
    </select>
  );
}

// End-date a row, or edit what doesn't change its rate (label, legal status,
// source, notes). Rates are fixed once saved.
export function DutyRowEditor({ row }: { row: ProgramDutyRow }) {
  return (
    // Closed it's just "Edit"; open, the form sets its own width.
    <details className="text-left">
      <summary className="cursor-pointer text-right text-sm font-medium whitespace-nowrap text-move-green outline-none focus-visible:ring-2 focus-visible:ring-move-green">
        Edit
      </summary>
      <div className="mt-3 flex w-80 flex-col gap-5">
        {!row.effective_to && (
          <ActionForm action={endDateDuty} submitLabel="End-date" variant="outline">
            <input type="hidden" name="id" value={row.id} />
            <label className={labelClass}>
              Last day it applies
              <input type="date" name="effective_to" min={row.effective_from} required className={fieldClass} />
            </label>
          </ActionForm>
        )}
        <ActionForm action={updateDutyDetails} submitLabel="Save details" variant="outline">
          <input type="hidden" name="id" value={row.id} />
          <label className={labelClass}>
            Label
            <input name="label" defaultValue={row.label} required maxLength={200} className={fieldClass} />
          </label>
          <label className={labelClass}>
            Legal status
            <LegalStatusSelect defaultValue={row.legal_status} />
          </label>
          <label className={labelClass}>
            Source
            <input name="source_label" defaultValue={row.source_label} required maxLength={500} className={fieldClass} />
          </label>
          <label className={labelClass}>
            Source link
            <input name="source_url" type="url" defaultValue={row.source_url} required className={fieldClass} />
          </label>
          <label className={labelClass}>
            Source checked on
            <input name="source_checked_on" type="date" defaultValue={row.source_checked_on} required className={fieldClass} />
          </label>
          <label className={labelClass}>
            Notes
            <textarea name="notes" defaultValue={row.notes ?? ""} rows={2} maxLength={2000} className={fieldClass} />
          </label>
          {row.condition_text && row.rate_type !== "unconfirmed" && (
            <>
              <input type="hidden" name="has_condition" value="1" />
              <label className="flex items-start gap-2 text-sm text-move-navy">
                <input
                  type="checkbox"
                  name="assume_condition"
                  defaultChecked={row.assume_condition}
                  className="mt-1 size-4 accent-move-green"
                />
                <span>
                  Treat the condition as met
                  <span className={`block ${hintClass}`}>
                    Only where it raises the duty: an estimate must not be lowered by a fact nobody has checked.
                  </span>
                </span>
              </label>
            </>
          )}
        </ActionForm>
      </div>
    </details>
  );
}

export function AddDutyForm({ programKey, today }: { programKey: string; today: string }) {
  return (
    <ActionForm action={addDuty} submitLabel="Add row" resetOnSuccess className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <input type="hidden" name="program_key" value={programKey} />
      <label className={labelClass}>
        Authority
        <select name="authority" defaultValue="section_301" className={fieldClass}>
          <option value="section_301">Section 301</option>
          <option value="section_232">Section 232</option>
          <option value="section_338">Section 338</option>
          <option value="section_201">Section 201</option>
          <option value="other">Other</option>
        </select>
      </label>
      <label className={labelClass}>
        Chapter 99 heading
        <input name="chapter99_heading" required placeholder="9903.05.84" className={fieldClass} />
      </label>
      <label className={labelClass}>
        For <span className={hintClass}>who or what the row covers, e.g. Vietnam</span>
        <input name="label" required maxLength={200} className={fieldClass} />
      </label>
      <label className={labelClass}>
        Rate type
        <select name="rate_type" defaultValue="add" className={fieldClass}>
          <option value="add">Add a rate</option>
          <option value="minimum_total">Minimum total rate</option>
          <option value="exempt">Exemption</option>
          <option value="unconfirmed">Unconfirmed (named, never counted)</option>
        </select>
      </label>
      <label className={labelClass}>
        Rate (%) <span className={hintClass}>empty for an exemption; optional if unconfirmed</span>
        <input name="rate_pct" type="number" min="0" max="1000" step="0.0001" className={fieldClass} />
      </label>
      <label className={labelClass}>
        Heading at the minimum <span className={hintClass}>minimum-total rows only, e.g. 9903.05.38</span>
        <input name="chapter99_heading_at_minimum" className={fieldClass} />
      </label>
      <label className={labelClass}>
        Origins <span className={hintClass}>ISO codes, e.g. VN IN; empty = any origin</span>
        <input name="origin_countries" className={fieldClass} />
      </label>
      <label className={labelClass}>
        Condition <span className={hintClass}>a fact the calculator can&apos;t check, shown as &ldquo;could be … if …&rdquo; or &ldquo;may be exempt if …&rdquo;; for an unconfirmed row, what&apos;s open</span>
        <input name="condition_text" maxLength={1000} className={fieldClass} />
      </label>
      <label className="flex items-start gap-2 text-sm text-move-navy md:col-span-2">
        <input type="checkbox" name="assume_condition" className="mt-1 size-4 accent-move-green" />
        <span>
          Treat the condition as met
          <span className={`block ${hintClass}`}>
            Only where the condition raises the duty. Left unticked, the row is only named and the higher rate applies.
          </span>
        </span>
      </label>
      <label className={labelClass}>
        Not when these programs apply <span className={hintClass}>program keys, e.g. section_232_metals</span>
        <input name="excludes_programs" className={fieldClass} />
      </label>
      <label className={labelClass}>
        Heading claimed then <span className={hintClass}>e.g. 9903.05.90</span>
        <input name="exclusion_heading" className={fieldClass} />
      </label>
      <label className={labelClass}>
        First day it applies
        <input name="effective_from" type="date" required className={fieldClass} />
      </label>
      <label className={labelClass}>
        Last day it applies <span className={hintClass}>optional</span>
        <input name="effective_to" type="date" className={fieldClass} />
      </label>
      <label className={labelClass}>
        Legal status
        <LegalStatusSelect defaultValue="in_force" />
      </label>
      <label className={labelClass}>
        Source checked on
        <input name="source_checked_on" type="date" defaultValue={today} required className={fieldClass} />
      </label>
      <label className={labelClass}>
        Source
        <input name="source_label" required maxLength={500} placeholder="HTS heading 9903.05.84 and U.S. note 52, FR 2026-15181" className={fieldClass} />
      </label>
      <label className={labelClass}>
        Source link
        <input name="source_url" type="url" required placeholder="https://www.federalregister.gov/…" className={fieldClass} />
      </label>
      <label className={`${labelClass} md:col-span-2`}>
        HTS scope <span className={hintClass}>one per line, &ldquo;0805.90.01 | Etrogs&rdquo;; the description limits it to that article. &ldquo;-2931.90.9051&rdquo; takes a statistical number out. Empty = every HTS code.</span>
        <textarea name="scope" rows={4} className={fieldClass} />
      </label>
      <label className={`${labelClass} md:col-span-2`}>
        Notes
        <textarea name="notes" rows={2} maxLength={2000} className={fieldClass} />
      </label>
    </ActionForm>
  );
}

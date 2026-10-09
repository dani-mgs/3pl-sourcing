import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getTariffPermissions } from "@/lib/auth/get-tariff-permissions";
import { formatCurrency } from "@/lib/currency";
import { formatRateDate } from "@/lib/fx/rate-provenance";
import { ActionForm } from "../action-form";
import { addFee, endDateFee } from "../actions";

const fieldClass =
  "w-full rounded-xl border border-neutral-border bg-white px-3 py-2 text-sm text-move-navy focus:border-move-green focus:outline-none focus:ring-2 focus:ring-move-green";
const labelClass = "flex flex-col gap-1.5 text-sm font-medium text-move-navy";

type FeeRow = {
  id: string;
  fee_code: string;
  label: string;
  rate_pct: number | null;
  min_usd: number | null;
  max_usd: number | null;
  flat_usd: number | null;
  applies_up_to_value_usd: number | null;
  effective_from: string;
  effective_to: string | null;
  source_label: string;
  source_url: string;
};

function feeText(f: FeeRow) {
  const usd = (n: number | null) => (n == null ? "—" : formatCurrency(Number(n), "USD"));
  if (f.fee_code === "mpf_formal") return `${f.rate_pct}% (min ${usd(f.min_usd)}, max ${usd(f.max_usd)})`;
  if (f.fee_code === "mpf_informal") return `${usd(f.flat_usd)} flat, up to ${usd(f.applies_up_to_value_usd)}`;
  return `${f.rate_pct}%`;
}

// Customs fees (MPF, HMF) for tariff editors and admins: end-date a row and
// add the next one (e.g. each fiscal year's MPF limits).
export default async function FeesPage() {
  const { canEditTariffData } = await getTariffPermissions();
  if (!canEditTariffData) notFound();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customs_fees")
    .select("id, fee_code, label, rate_pct, min_usd, max_usd, flat_usd, applies_up_to_value_usd, effective_from, effective_to, source_label, source_url")
    .order("fee_code")
    .order("effective_from", { ascending: false });
  if (error) console.error("FeesPage error:", error);
  const fees = (data ?? []) as FeeRow[];

  return (
    <div className="mx-auto max-w-6xl px-8 py-10 max-sm:px-4">
      <Link
        href="/tariff-calculator/duty-data"
        className="mb-4 inline-flex items-center gap-1.5 rounded text-sm text-neutral-muted outline-none hover:text-move-navy focus-visible:ring-2 focus-visible:ring-move-green"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Duty data
      </Link>
      <h1 className="mb-1 font-display text-2xl font-semibold text-move-navy">Customs fees</h1>
      <p className="mb-8 text-sm text-neutral-muted">
        Each fee has one row in force on any day. To change one, end-date the current row and add the new one from the
        next day.
      </p>

      <section className="rounded-2xl border border-neutral-border bg-white p-6 shadow-sm">
        <div className="relative overflow-x-auto">
          <table className="w-full text-left text-sm text-move-navy">
            <thead>
              <tr className="border-b border-neutral-border text-xs tracking-wide text-neutral-muted uppercase">
                <th scope="col" className="px-4 py-3 font-medium">Fee</th>
                <th scope="col" className="px-4 py-3 font-medium">Rate</th>
                <th scope="col" className="px-4 py-3 font-medium">Effective</th>
                <th scope="col" className="px-4 py-3 font-medium">Source</th>
                <th scope="col" className="px-4 py-3 font-medium"><span className="sr-only">End-date</span></th>
              </tr>
            </thead>
            <tbody>
              {fees.map((f) => (
                <tr key={f.id} className="border-b border-neutral-border align-top last:border-0">
                  <td className="px-4 py-3">{f.label}</td>
                  <td className="px-4 py-3">{feeText(f)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {formatRateDate(f.effective_from)}
                    {f.effective_to && <> – {formatRateDate(f.effective_to)}</>}
                  </td>
                  <td className="px-4 py-3">
                    <a href={f.source_url} target="_blank" rel="noopener noreferrer" className="underline decoration-neutral-border underline-offset-2 hover:decoration-move-green">
                      {f.source_label}
                    </a>
                  </td>
                  <td className="px-4 py-3">
                    {!f.effective_to && (
                      <details>
                        <summary className="cursor-pointer text-sm font-medium text-move-green">End-date</summary>
                        <div className="mt-3 w-64">
                          <ActionForm action={endDateFee} submitLabel="End-date" variant="outline">
                            <input type="hidden" name="id" value={f.id} />
                            <label className={labelClass}>
                              Last day it applies
                              <input type="date" name="effective_to" min={f.effective_from} required className={fieldClass} />
                            </label>
                          </ActionForm>
                        </div>
                      </details>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-neutral-border bg-white p-6 shadow-sm">
        <h2 className="mb-4 font-display text-lg font-semibold text-move-navy">Add a fee row</h2>
        <ActionForm action={addFee} submitLabel="Add fee row" resetOnSuccess className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <label className={labelClass}>
            Fee
            <select name="fee_code" defaultValue="mpf_formal" className={fieldClass}>
              <option value="mpf_formal">MPF (formal entry)</option>
              <option value="mpf_informal">MPF (informal entry)</option>
              <option value="hmf">HMF</option>
            </select>
          </label>
          <label className={labelClass}>
            Label
            <input name="label" required maxLength={200} className={fieldClass} />
          </label>
          <label className={labelClass}>
            First day it applies
            <input name="effective_from" type="date" required className={fieldClass} />
          </label>
          <label className={labelClass}>
            Rate (%) <span className="text-xs font-normal text-neutral-muted">formal MPF, HMF</span>
            <input name="rate_pct" type="number" min="0" step="0.000001" className={fieldClass} />
          </label>
          <label className={labelClass}>
            Minimum (USD) <span className="text-xs font-normal text-neutral-muted">formal MPF</span>
            <input name="min_usd" type="number" min="0" step="0.01" className={fieldClass} />
          </label>
          <label className={labelClass}>
            Maximum (USD) <span className="text-xs font-normal text-neutral-muted">formal MPF</span>
            <input name="max_usd" type="number" min="0" step="0.01" className={fieldClass} />
          </label>
          <label className={labelClass}>
            Flat fee (USD) <span className="text-xs font-normal text-neutral-muted">informal MPF</span>
            <input name="flat_usd" type="number" min="0" step="0.01" className={fieldClass} />
          </label>
          <label className={labelClass}>
            Applies up to value (USD) <span className="text-xs font-normal text-neutral-muted">informal MPF</span>
            <input name="applies_up_to_value_usd" type="number" min="0" step="0.01" className={fieldClass} />
          </label>
          <label className={labelClass}>
            Source
            <input name="source_label" required maxLength={500} className={fieldClass} />
          </label>
          <label className={`${labelClass} md:col-span-2`}>
            Source link
            <input name="source_url" type="url" required placeholder="https://www.federalregister.gov/…" className={fieldClass} />
          </label>
          <label className={labelClass}>
            Notes
            <input name="notes" maxLength={2000} className={fieldClass} />
          </label>
        </ActionForm>
      </section>
    </div>
  );
}

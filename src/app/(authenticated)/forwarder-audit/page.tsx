import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isForwarderAuditEnabled } from "@/lib/forwarder-audit/feature-flag";
import { LIST_LIMIT, listAudits } from "@/lib/forwarder-audit/server-audit";
import { loadFirstNames } from "@/lib/landed-cost/server-workspace-list";
import { formatRateDate, timestampDateUtc } from "@/lib/fx/rate-provenance";
import { personName } from "@/lib/tariff/fee-audit";
import { NewAuditButton } from "./new-audit-button";
import { STATUS_CLASS, cardClass, sectionTitleClass } from "./styles";

// Forwarder Audit: the audits (any staff member can open one; only its owner
// or an admin can edit it). Behind FORWARDER_AUDIT_ENABLED: off, this page
// doesn't exist.
export default async function ForwarderAuditPage() {
  if (!isForwarderAuditEnabled()) notFound();
  const supabase = await createClient();
  const list = await listAudits(supabase);
  const names = list.ok
    ? await loadFirstNames(supabase, list.rows.map((r) => r.ownerId).filter(Boolean)).catch(() => new Map<string, string | null>())
    : new Map<string, string | null>();

  return (
    <div className="mx-auto max-w-6xl px-8 py-10 max-sm:px-4">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-move-navy">Forwarder Audit</h1>
          <p className="mt-1 text-sm text-neutral-muted">
            Check one freight quotation against the commercial invoice and packing list. Rules of workbook version 1.0.
          </p>
        </div>
        <NewAuditButton />
      </div>

      <section className={cardClass} aria-labelledby="audits-title">
        <h2 id="audits-title" className={`${sectionTitleClass} mb-4`}>
          Audits
        </h2>
        {!list.ok ? (
          <p className="text-sm text-danger" role="alert">
            {list.message}
          </p>
        ) : list.rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-neutral-muted">No audits yet. Start one to check a quotation.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-move-navy">
              <thead>
                <tr className="border-b border-neutral-border text-xs tracking-wide text-neutral-muted uppercase">
                  <th scope="col" className="px-4 py-3 font-medium">Reference</th>
                  <th scope="col" className="px-4 py-3 font-medium">Client</th>
                  <th scope="col" className="px-4 py-3 font-medium">Forwarder</th>
                  <th scope="col" className="px-4 py-3 font-medium">Status</th>
                  <th scope="col" className="px-4 py-3 font-medium">Owner</th>
                  <th scope="col" className="px-4 py-3 font-medium">Last updated</th>
                </tr>
              </thead>
              <tbody>
                {list.rows.map((a) => (
                  <tr key={a.id} className="border-b border-neutral-border last:border-0 hover:bg-neutral-bg">
                    <td className="px-4 py-3 font-medium">
                      <Link href={`/forwarder-audit/${a.id}`} className="text-move-green hover:underline">
                        {a.reference || "(no reference)"}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{a.client}</td>
                    <td className="px-4 py-3">{a.forwarder}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[a.status] ?? "bg-neutral-bg"}`}>{a.status}</span>
                    </td>
                    <td className="px-4 py-3">{a.ownerId ? personName(a.ownerId, names) : ""}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-neutral-muted">{formatRateDate(timestampDateUtc(a.updatedAt))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {list.more && <p className="mt-3 text-xs text-neutral-muted">Showing the {LIST_LIMIT} most recently updated audits.</p>}
          </div>
        )}
      </section>
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getUserRole } from "@/lib/auth/get-user-role";
import { isForwarderAuditEnabled } from "@/lib/forwarder-audit/feature-flag";
import { loadAudit } from "@/lib/forwarder-audit/server-audit";
import { loadFirstNames } from "@/lib/landed-cost/server-workspace-list";
import { personName } from "@/lib/tariff/fee-audit";
import { cardClass } from "../styles";
import { AuditEditor } from "./audit-editor";

// One Forwarder Audit: its inputs, edited as a local draft and saved whole;
// the results are calculated from the inputs by the same engine in the
// browser as you type and again for the list and the Summary (never stored).
// Any staff member can open it; only its owner or an admin can edit it.
// Behind FORWARDER_AUDIT_ENABLED: off, this page doesn't exist.
export default async function ForwarderAuditPage({ params }: PageProps<"/forwarder-audit/[id]">) {
  if (!isForwarderAuditEnabled()) notFound();
  const { id } = await params;
  const supabase = await createClient();
  const [loaded, { data: auth }, role] = await Promise.all([loadAudit(supabase, id), supabase.auth.getUser(), getUserRole()]);
  if (!loaded.ok && loaded.code === "not_found") notFound();

  const back = (
    <Link href="/forwarder-audit" className="inline-flex items-center gap-1.5 text-sm font-medium text-move-green hover:underline">
      <ArrowLeft aria-hidden="true" className="size-4" /> Forwarder Audit
    </Link>
  );
  if (!loaded.ok) {
    return (
      <div className="mx-auto max-w-6xl px-8 py-10 max-sm:px-4">
        {back}
        <p className={`${cardClass} mt-6 text-sm text-danger`} role="alert">
          {loaded.message}
        </p>
      </div>
    );
  }

  const audit = loaded.audit;
  const names = await loadFirstNames(supabase, [audit.ownerId]).catch(() => new Map<string, string | null>());
  const canEdit = auth.user?.id === audit.ownerId || role === "admin";
  return (
    <div className="mx-auto max-w-[1680px] px-8 py-6 max-sm:px-4">
      <div className="mb-4">{back}</div>
      <AuditEditor auditId={audit.id} initial={audit.inputs} updatedAt={audit.updatedAt} canEdit={canEdit} ownerName={personName(audit.ownerId, names)} />
    </div>
  );
}

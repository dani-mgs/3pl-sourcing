import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Lock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getUserRole } from "@/lib/auth/get-user-role";
import { formatRateDate } from "@/lib/fx/rate-provenance";
import { loadAuthorNames } from "@/lib/tariff/estimate-authors";
import { SAVED_ESTIMATE_COLUMNS, rowToSavedEstimate } from "@/lib/tariff/saved-estimate";
import { EstimateResultView } from "../../estimate-result";
import { DeleteEstimateButton } from "./delete-estimate-button";

// A saved estimate: shown exactly as locked (rates, dates, sources and the
// warnings at the time), never recalculated.
export default async function SavedEstimatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const supabase = await createClient();
  const [{ data: row, error }, { data: auth }, role] = await Promise.all([
    supabase.from("duty_estimates").select(SAVED_ESTIMATE_COLUMNS).eq("id", id).maybeSingle(),
    supabase.auth.getUser(),
    getUserRole(),
  ]);
  if (error) console.error("SavedEstimatePage error:", error);
  if (!row) notFound();

  const saved = rowToSavedEstimate(row);
  const authors = saved ? await loadAuthorNames(supabase, [saved.createdBy]) : new Map<string, string>();
  const canDelete = saved != null && (auth.user?.id === saved.createdBy || role === "admin");

  return (
    <div className="mx-auto max-w-4xl px-8 py-10 max-sm:px-4">
      <Link
        href="/tariff-calculator"
        className="mb-4 inline-flex items-center gap-1.5 rounded text-sm text-neutral-muted outline-none hover:text-move-navy focus-visible:ring-2 focus-visible:ring-move-green"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Tariff Calculator
      </Link>

      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-move-navy">
            {saved?.label ?? "Saved estimate"}
          </h1>
          {saved && (
            <p className="mt-1 flex items-center gap-1.5 text-sm text-neutral-muted">
              <Lock aria-hidden="true" className="size-3.5" />
              Locked {formatRateDate(saved.createdAt.slice(0, 10))}
              {authors.get(saved.createdBy) && <> by {authors.get(saved.createdBy)}</>} · rates and dates as
              saved; not recalculated
            </p>
          )}
        </div>
        {canDelete && saved && <DeleteEstimateButton estimateId={saved.id} />}
      </div>

      <section className="rounded-2xl border border-neutral-border bg-white p-8 shadow-sm">
        {saved ? (
          <EstimateResultView estimate={saved.estimate} />
        ) : (
          <p className="text-sm text-neutral-muted">This estimate can&apos;t be displayed.</p>
        )}
      </section>
    </div>
  );
}

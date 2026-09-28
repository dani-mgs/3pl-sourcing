"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatCurrency } from "@/lib/currency";
import { freightCostUsd, type ForwarderQuoteInput } from "@/lib/forwarder/cost-comparison";
import { deleteQuote } from "./quotes/[quoteId]/actions";

export type QuoteRow = ForwarderQuoteInput & {
  id: string;
  updatedRelative: string;
};

const headClass = "px-4 py-3 text-xs font-medium uppercase tracking-wide text-neutral-muted";

// Mirrors the weight-selection logic in cost-comparison.ts's
// buildForwarderCostComparison: chargeable weight for Air when set, actual
// weight otherwise. Not imported from there since that function needs full
// project terms this table doesn't have.
function costPerKg(quote: QuoteRow, freight: number | null): number | null {
  if (freight == null) return null;
  const weight =
    quote.shipment_mode === "Air" && quote.chargeable_weight_kg != null
      ? quote.chargeable_weight_kg
      : quote.actual_weight_kg;
  if (weight == null || weight === 0) return null;
  return freight / weight;
}

function QuoteRowMenu({
  projectId,
  forwarderId,
  quote,
  canWrite,
}: {
  projectId: string;
  forwarderId: string;
  quote: QuoteRow;
  canWrite: boolean;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleConfirmDelete() {
    startTransition(async () => {
      const result = await deleteQuote(projectId, forwarderId, quote.id);
      if (result?.error) {
        setError(result.error);
      } else {
        setConfirmOpen(false);
      }
    });
  }

  if (!canWrite) return null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Row actions"
          className="flex size-9 items-center justify-center rounded-lg border border-neutral-border bg-white text-lg font-bold leading-none text-move-navy outline-none hover:border-move-navy/40 hover:bg-neutral-bg focus-visible:ring-2 focus-visible:ring-move-green aria-expanded:bg-neutral-bg"
        >
          ⋯
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            render={
              <Link
                href={`/forwarder-sourcing/${projectId}/forwarders/${forwarderId}/quotes/${quote.id}/edit`}
              />
            }
          >
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onClick={() => {
              setError(null);
              setConfirmOpen(true);
            }}
          >
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Quote</DialogTitle>
            <DialogDescription>
              Delete this {quote.scenario_group} quote? This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={handleConfirmDelete} disabled={isPending}>
              {isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>

          {error && (
            <p className="text-sm text-danger" role="alert">
              {error}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export function QuotesTable({
  projectId,
  forwarderId,
  quotes,
  canWrite,
}: {
  projectId: string;
  forwarderId: string;
  quotes: QuoteRow[];
  canWrite: boolean;
}) {
  if (quotes.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        {canWrite && (
          <div className="flex justify-end">
            <Button
              nativeButton={false}
              render={<Link href={`/forwarder-sourcing/${projectId}/forwarders/${forwarderId}/quotes/new`} />}
            >
              Add Quote
            </Button>
          </div>
        )}
        <p className="py-6 text-center text-sm text-neutral-muted">
          No quotes yet. Add one once this forwarder has quoted.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {canWrite && (
        <div className="flex justify-end">
          <Button
            nativeButton={false}
            render={<Link href={`/forwarder-sourcing/${projectId}/forwarders/${forwarderId}/quotes/new`} />}
          >
            Add Quote
          </Button>
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-neutral-border bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-neutral-border">
              <th className={headClass}>Scenario Group</th>
              <th className={headClass}>Incoterm / Mode / Type</th>
              <th className={headClass}>Cost</th>
              <th className={headClass}>Cost / kg</th>
              <th className={headClass}>Completeness</th>
              <th className={headClass}>Updated</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {quotes.map((quote) => {
              const freight = freightCostUsd(quote);
              const perKg = costPerKg(quote, freight);
              const terms = [quote.incoterm, quote.shipment_mode, quote.shipment_type]
                .filter(Boolean)
                .join(" / ");
              return (
                <tr key={quote.id} className="border-b border-neutral-border last:border-b-0 hover:bg-neutral-bg">
                  <td className="px-4 py-3 text-move-navy">{quote.scenario_group}</td>
                  <td className="px-4 py-3 text-neutral-muted">{terms || "—"}</td>
                  <td className="px-4 py-3 text-move-navy tabular-nums">
                    {quote.original_amount != null
                      ? formatCurrency(quote.original_amount, quote.original_currency)
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-neutral-muted tabular-nums">
                    {perKg != null ? formatCurrency(perKg, "USD") : "—"}
                  </td>
                  <td className="px-4 py-3 text-neutral-muted">{quote.quote_completeness ?? "—"}</td>
                  <td className="px-4 py-3 text-neutral-muted">{quote.updatedRelative}</td>
                  <td className="px-4 py-3">
                    <QuoteRowMenu projectId={projectId} forwarderId={forwarderId} quote={quote} canWrite={canWrite} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

import { Check, X } from "lucide-react";
import { SectionCard } from "@/components/section-card";
import type { RequirementFit } from "@/lib/forwarder/requirement-fit";
import { ATTENTION_TEXT } from "../../quote-cells";

const BASIS_TEXT = {
  final: "Based on the project's final terms, brokerage, and insurance.",
  current: "Based on the project's current terms (final terms not set), brokerage, and insurance.",
} as const;

// Replaces the old all-capabilities chip row: the same 11 capabilities,
// sorted into what the project needs, what else is confirmed, and the rest.
export function RequirementFitCard({ fit }: { fit: RequirementFit }) {
  return (
    <SectionCard title="Requirement Fit">
      {fit.requirements.length === 0 ? (
        <p className="text-sm text-neutral-muted">
          No requirements set on project. Set its shipment mode and type, brokerage, or
          insurance to check fit.
        </p>
      ) : (
        <>
          <p className="mb-3 text-xs text-neutral-muted">
            {fit.basis ? BASIS_TEXT[fit.basis] : "Based on the project's brokerage and insurance."}
          </p>
          <ul className="flex flex-col gap-2">
            {fit.requirements.map((r) => (
              <li key={r.key} className="flex items-start gap-2 text-sm">
                {r.confirmed ? (
                  <Check className="mt-0.5 size-4 shrink-0 text-move-green" aria-hidden="true" />
                ) : (
                  <X className={`mt-0.5 size-4 shrink-0 ${ATTENTION_TEXT}`} aria-hidden="true" />
                )}
                <span className="min-w-0">
                  <span className={r.confirmed ? "text-move-navy" : `font-medium ${ATTENTION_TEXT}`}>
                    {r.label}
                  </span>
                  <span className="text-neutral-muted">
                    {" "}
                    — {r.confirmed ? "confirmed" : "not confirmed"} · {r.reason}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="mt-4 flex flex-col gap-2 border-t border-neutral-border pt-3 text-sm">
        <p>
          <span className="text-xs text-neutral-muted">Also offers: </span>
          <span className="text-move-navy">
            {fit.alsoOffers.length ? fit.alsoOffers.map((c) => c.label).join(", ") : "—"}
          </span>
        </p>
        {fit.notConfirmed.length > 0 && (
          <details className="group">
            <summary className="cursor-pointer text-xs text-neutral-muted outline-none hover:text-move-navy focus-visible:ring-2 focus-visible:ring-move-green">
              Not confirmed ({fit.notConfirmed.length})
            </summary>
            <p className="mt-1 text-neutral-muted">
              {fit.notConfirmed.map((c) => c.label).join(", ")}
            </p>
          </details>
        )}
      </div>
    </SectionCard>
  );
}

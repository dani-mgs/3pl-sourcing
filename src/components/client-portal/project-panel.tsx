import type { ReactNode } from "react";
import { formatDateOnly } from "@/lib/client-updates/dates";
import type { ForwarderPayload, ThreePlPayload } from "@/lib/client-updates/payload-schema";
import {
  ESTIMATES_FOOTER,
  FUNNEL_CAPTION,
  FUNNEL_LABELS,
  NO_BASELINE_NOTE,
  THREE_PL_COST_CAPTION,
  displayComparability,
  fcrText,
  forwarderCostCaption,
  forwarderCostTitle,
  forwarderEmptyCost,
  funnelTitle,
  kindLabel,
  leadTimeCaption,
  leadTimeTitle,
  nextStepText,
  projectContext,
  threePlCostTitle,
  threePlEmptyCost,
  usd,
  validityText,
  vsToday,
  type ClientUpdateView,
} from "@/lib/client-updates/portal-text";
import { ChartFrame } from "./chart-frame";
import { CostBars, DataTable, FunnelBars, LeadTimeRanges, SavingBars, optionNote } from "./charts";
import { LocalDate } from "./local-date";
import { StageStepper } from "./stage-stepper";

// One engagement as the client sees it, drawn only from a published
// snapshot (or, in the publish preview, from the payload the server just
// built). Forwarder projects are teal, 3PL projects purple, and every heading,
// chart and card names its project, so two engagements can't be confused.
// Read-only: approving and asking come in Phase 3.

type Tone = "teal" | "purple";

// decision: what goes under the recommendation (the client's buttons, or
// the decision already made). Without it (staff previews) the card says to
// reply to the Move contact.
export function ProjectPanel({ update, today, decision }: { update: ClientUpdateView; today: string; decision?: ReactNode }) {
  const { payload } = update;
  const tone: Tone = payload.kind === "forwarder" ? "teal" : "purple";
  const context = projectContext(payload);
  const next = nextStepText(update, today);
  const border = tone === "teal" ? "border-portal-teal" : "border-portal-purple";
  const band = tone === "teal" ? "bg-portal-teal-bg" : "bg-portal-purple-bg";
  const accentText = tone === "teal" ? "text-portal-teal" : "text-portal-purple";

  return (
    <section aria-label={context} className={`min-w-0 overflow-hidden rounded-2xl border-2 ${border} bg-white`}>
      <header className={`${band} flex flex-col gap-2 px-5 py-4`}>
        <p className={`text-xs font-bold uppercase tracking-wide ${accentText}`}>{kindLabel(payload.kind)}</p>
        <h3 className="font-display text-xl font-extrabold text-portal-ink">
          {payload.project.route ?? kindLabel(payload.kind)}
        </h3>
        {payload.project.facts.length > 0 && (
          <ul className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-portal-muted">
            {payload.project.facts.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        )}
        <p className="text-xs text-portal-muted">
          {update.publishedAt ? (
            <>
              Updated <LocalDate timestamp={update.publishedAt} />
              {payload.author.firstName ? ` by ${payload.author.firstName}, Move` : " by Move"}
            </>
          ) : (
            "Preview: not shared yet"
          )}
        </p>
      </header>

      <div className="flex flex-col gap-6 px-5 py-5">
        <StageStepper stage={update.stage} tone={tone} />

        {update.needsClientAction && (
          <p className="flex items-center gap-2 self-start rounded-full border border-portal-amber bg-portal-amber-bg px-3 py-1 text-sm font-semibold text-portal-amber">
            <span aria-hidden="true">!</span> Needs your input
          </p>
        )}

        <div className="flex flex-col gap-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-portal-muted">Where we are · {context}</h4>
          <p className="text-lg font-bold text-portal-ink">{update.headline}</p>
          <p className="whitespace-pre-line text-[15px] leading-relaxed text-portal-ink">{update.summary}</p>
          {next && (
            <p className="text-[15px] text-portal-ink">
              <span className="font-semibold">Next: </span>
              {next}
            </p>
          )}
        </div>

        {payload.kind === "forwarder" ? (
          <ForwarderFigures payload={payload} context={context} tone={tone} today={today} />
        ) : (
          <ThreePlFigures payload={payload} context={context} tone={tone} />
        )}

        {payload.funnel && (
          <ChartFrame
            context={context}
            title={funnelTitle(payload)}
            caption={FUNNEL_CAPTION}
            chart={<FunnelBars tone={tone} steps={payload.funnel.map((s) => ({ label: FUNNEL_LABELS[s.step], count: s.count }))} />}
            table={
              <DataTable
                caption={`${context}: partners at each step`}
                head={["Step", "Partners"]}
                rows={payload.funnel.map((s) => [FUNNEL_LABELS[s.step], s.count])}
              />
            }
          />
        )}

        <RecommendationCard update={update} context={context} tone={tone} decision={decision} />

        {payload.milestones.length > 0 && <Milestones update={update} context={context} today={today} />}

        <footer className="flex flex-col gap-1 border-t border-neutral-border pt-4 text-sm text-portal-muted">
          <p>
            <span className="mr-2 rounded border border-portal-line px-1.5 py-0.5 text-xs font-semibold text-portal-ink">Estimates</span>
            {ESTIMATES_FOOTER}
          </p>
          {payload.contact.firstName && (
            <p>
              Your Move contact for this project: {payload.contact.firstName}
              {payload.contact.email && (
                <>
                  {" · "}
                  <a className="text-move-navy underline" href={`mailto:${payload.contact.email}`}>
                    {payload.contact.email}
                  </a>
                </>
              )}
            </p>
          )}
        </footer>
      </div>
    </section>
  );
}

function EmptyNote({ children }: { children: string }) {
  return <p className="rounded-lg border border-dashed border-portal-line bg-neutral-bg px-4 py-3 text-sm text-portal-ink">{children}</p>;
}

// ---- Forwarder figures --------------------------------------------------------------

function ForwarderFigures({ payload, context, tone, today }: { payload: ForwarderPayload; context: string; tone: Tone; today: string }) {
  const c = payload.comparison;
  const comparabilityOf = (o: ForwarderPayload["comparison"]["options"][number]) => displayComparability(o, today);
  const empty = forwarderEmptyCost(c);
  const fcr = c.show.fcr ? fcrText(c) : null;
  const validity = c.show.validity ? validityText(c, today) : null;

  return (
    <div className="flex flex-col gap-6">
      {empty && <EmptyNote>{empty}</EmptyNote>}
      {c.show.cost && (
        <ChartFrame
          context={context}
          title={forwarderCostTitle(c, today)}
          caption={forwarderCostCaption(c)}
          chart={<CostBars options={c.options} todayUsd={c.today.costUsd} tone={tone} comparabilityOf={comparabilityOf} />}
          table={
            <DataTable
              caption={`${context}: freight per shipment, in US dollars`}
              head={["Option", "Per shipment", "vs. today", "Transit", "Freight Cost Ratio"]}
              rows={[
                ...(c.today.costUsd != null
                  ? [["Today", usd(c.today.costUsd), "—", c.today.leadTimeDays != null ? `~${c.today.leadTimeDays} days` : "—", c.today.fcrPct ?? "—"]]
                  : []),
                ...c.options.map((o) => {
                  const comparability = comparabilityOf(o);
                  return [
                    `${o.name}${o.role === "recommended" ? " (recommended)" : ""}`,
                    o.costUsd != null ? usd(o.costUsd) : "—",
                    comparability === "like_for_like" && o.savingPct != null ? vsToday(o.savingPct) : (optionNote(o, comparability) ?? "—"),
                    o.leadMinDays != null ? `${o.leadMinDays}–${o.leadMaxDays ?? o.leadMinDays} days` : "—",
                    o.fcrPct ?? "—",
                  ];
                }),
              ]}
            />
          }
        />
      )}
      {c.show.cost && c.savingsNote === "no_baseline" && <EmptyNote>{NO_BASELINE_NOTE}</EmptyNote>}
      {c.annual && (
        <p className="text-sm text-portal-ink">
          <span className="font-semibold">Annual estimate: </span>
          about {usd(Math.round(c.annual.savingUsd))} a year at {c.annual.shipmentsPerYear} shipments a year, with{" "}
          {c.bestSaving?.name}.
        </p>
      )}

      {fcr && (
        <div className="rounded-xl border border-neutral-border px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-portal-muted">Freight Cost Ratio · {context}</p>
          {"empty" in fcr ? (
            <p className="mt-1 text-sm text-portal-ink">{fcr.empty}</p>
          ) : (
            <>
              <p className="mt-1 text-2xl font-extrabold text-portal-ink">{fcr.title}</p>
              <p className="text-sm text-portal-muted">{fcr.caption}</p>
            </>
          )}
        </div>
      )}

      {c.show.leadTime && (
        <ChartFrame
          context={context}
          title={leadTimeTitle(c)}
          caption={leadTimeCaption(c)}
          chart={<LeadTimeRanges options={c.options} todayDays={c.today.leadTimeDays} targetDays={c.targetLeadTimeDays} tone={tone} />}
          table={
            <DataTable
              caption={`${context}: transit time in days`}
              head={["Option", "Fastest", "Slowest"]}
              rows={[
                ...(c.today.leadTimeDays != null ? [["Today", c.today.leadTimeDays, c.today.leadTimeDays]] : []),
                ...(c.targetLeadTimeDays != null ? [["Your target", c.targetLeadTimeDays, c.targetLeadTimeDays]] : []),
                ...c.options
                  .filter((o) => o.leadMinDays != null || o.leadMaxDays != null)
                  .map((o) => [o.name, o.leadMinDays ?? o.leadMaxDays ?? "—", o.leadMaxDays ?? o.leadMinDays ?? "—"]),
              ]}
            />
          }
        />
      )}

      {validity && (
        <p
          className={
            "rounded-lg px-4 py-2 text-sm " +
            (validity.tone === "ok" ? "bg-neutral-bg text-portal-ink" : "border border-portal-amber bg-portal-amber-bg text-portal-amber")
          }
        >
          {validity.tone !== "ok" && <span aria-hidden="true">! </span>}
          {validity.text}
        </p>
      )}
    </div>
  );
}

// ---- 3PL figures -----------------------------------------------------------------------

function ThreePlFigures({ payload, context, tone }: { payload: ThreePlPayload; context: string; tone: Tone }) {
  const c = payload.comparison;
  const empty = threePlEmptyCost(c);
  return (
    <div className="flex flex-col gap-6">
      {empty && <EmptyNote>{empty}</EmptyNote>}
      {c.show.cost && (
        <ChartFrame
          context={context}
          title={threePlCostTitle(c)}
          caption={THREE_PL_COST_CAPTION}
          chart={<SavingBars options={c.options} tone={tone} />}
          table={
            <DataTable
              caption={`${context}: quoted rate cards against today's`}
              head={["Warehouse", "Location", "Rate card vs. today"]}
              rows={c.options.map((o) => [
                `${o.name}${o.role === "recommended" ? " (recommended)" : ""}`,
                o.location ?? "—",
                o.savingPct != null ? vsToday(o.savingPct) : "—",
              ])}
            />
          }
        />
      )}
      {!c.show.cost && c.options.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-portal-muted">Your shortlist · {context}</h4>
          <ul className="mt-2 flex flex-col gap-1 text-sm text-portal-ink">
            {c.options.map((o) => (
              <li key={o.name}>
                <span className="font-semibold">{o.name}</span>
                {o.location && ` · ${o.location}`}
                {o.role === "recommended" && " · Recommended"}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ---- Recommendation -----------------------------------------------------------------------

function RecommendationCard({
  update,
  context,
  tone,
  decision,
}: {
  update: ClientUpdateView;
  context: string;
  tone: Tone;
  decision?: ReactNode;
}) {
  const rec = update.payload.recommendation;
  const border = tone === "teal" ? "border-portal-teal" : "border-portal-purple";
  const accentText = tone === "teal" ? "text-portal-teal" : "text-portal-purple";
  const { firstName, email } = update.payload.contact;
  return (
    <div className={`rounded-xl border-2 ${border} px-5 py-4`}>
      <p className={`text-xs font-bold uppercase tracking-wide ${accentText}`}>Move recommends</p>
      <p className="text-xs text-portal-muted">for your {context.charAt(0).toLowerCase() + context.slice(1)}</p>
      {rec ? (
        <div className="mt-2 flex flex-col gap-3">
          <p className="text-xl font-extrabold text-portal-ink">{rec.name}</p>
          {rec.reasons.length > 0 && (
            <div>
              <p className="text-sm font-semibold text-portal-ink">Why</p>
              <ul className="ml-5 list-disc text-sm text-portal-ink">
                {rec.reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </div>
          )}
          {rec.tradeOffs.length > 0 && (
            <div>
              <p className="text-sm font-semibold text-portal-ink">Trade-offs</p>
              <ul className="ml-5 list-disc text-sm text-portal-ink">
                {rec.tradeOffs.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>
          )}
          {rec.basedOn && <p className="text-sm text-portal-muted">{rec.basedOn}</p>}
          {decision ?? (
            <p className="text-sm text-portal-muted">
              To approve, reply to your Move contact
              {firstName ? `: ${firstName}` : ""}
              {email && (
                <>
                  {" ("}
                  <a className="text-move-navy underline" href={`mailto:${email}`}>
                    {email}
                  </a>
                  {")"}
                </>
              )}
              .
            </p>
          )}
        </div>
      ) : (
        <p className="mt-2 text-sm text-portal-ink">Not ready yet. We&apos;ll share our recommendation here once the comparison is done.</p>
      )}
    </div>
  );
}

// ---- Milestones -----------------------------------------------------------------------------

function Milestones({ update, context, today }: { update: ClientUpdateView; context: string; today: string }) {
  return (
    <div>
      <h4 className="text-xs font-semibold uppercase tracking-wide text-portal-muted">Milestones · {context}</h4>
      <ul className="mt-2 flex flex-col gap-2 text-sm text-portal-ink">
        {update.payload.milestones.map((m) => (
          <li key={m.label} className="flex flex-wrap gap-x-3">
            <span className="font-semibold">
              {m.actual ? <span aria-hidden="true">✓ </span> : <span aria-hidden="true">◇ </span>}
              {m.label}
            </span>
            {m.planned && <span className="text-portal-muted">Planned {formatDateOnly(m.planned, today)}</span>}
            <span className={m.actual ? "" : "text-portal-muted"}>{m.actual ? `Done ${formatDateOnly(m.actual, today)}` : "Not done yet"}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}


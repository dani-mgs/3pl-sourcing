import Link from "next/link";
import { formatDateOnly } from "@/lib/client-updates/dates";
import type { PortalLoad } from "@/lib/client-updates/load-portal";
import { buildTimeline, keyFigures, lastUpdated, needsYou, type Engagement } from "@/lib/client-updates/portal-data";
import { ESTIMATES_FOOTER, kindLabel, nextStepText, percent } from "@/lib/client-updates/portal-text";
import { CLIENT_STAGES, stageLabel } from "@/lib/client-updates/stages";
import { EngagementSwitcher, type EngagementTile } from "./engagement-switcher";
import { LocalDate } from "./local-date";
import { PortalTimeline } from "./portal-timeline";
import { ProjectPanel } from "./project-panel";

// The client portal's Move summary (Main.dc.html), drawn only from published
// snapshots. Used by /portal and by staff "View as client", so both show
// exactly the same thing. Read-only: approvals and questions come in Phase 3.

export function ViewSwitch({ current, summaryHref, reportHref, tier }: {
  current: "summary" | "report";
  summaryHref: string;
  reportHref: string;
  tier: PortalLoad["tier"];
}) {
  const on = "rounded-full bg-move-navy px-4 py-2 text-sm font-semibold text-white";
  const off = "rounded-full border border-portal-line bg-white px-4 py-2 text-sm font-semibold text-move-navy hover:border-move-navy";
  return (
    <nav aria-label="Report level" className="flex flex-wrap items-center gap-2">
      <span className="mr-1 text-sm text-portal-muted">Viewing:</span>
      <Link href={summaryHref} aria-current={current === "summary" ? "page" : undefined} className={current === "summary" ? on : off}>
        Move summary (included)
      </Link>
      <Link href={reportHref} aria-current={current === "report" ? "page" : undefined} className={current === "report" ? on : off}>
        Market Report {tier === "market_report" ? "(your plan)" : "(paid, locked)"}
      </Link>
    </nav>
  );
}

function tileFor(e: Engagement, today: string): EngagementTile {
  const p = e.latest.payload;
  const next = nextStepText(e.latest, today);
  return {
    key: e.key,
    kind: e.kind,
    kindLabel: kindLabel(e.kind),
    route: p.project.route ?? kindLabel(e.kind),
    stageLine: `Stage ${e.latest.stage} of 7 · ${stageLabel(e.latest.stage)}`,
    nextLine: e.complete ? null : next ? `Next: ${next}` : null,
    status: e.complete ? "complete" : e.latest.needsClientAction ? "needs" : "on_track",
  };
}

function Figure({ value, label, caption }: { value: string; label: string; caption: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-2xl border border-neutral-border bg-white p-4">
      <p className="text-sm text-portal-muted">{label}</p>
      <p className="font-display text-3xl font-extrabold text-portal-ink">{value}</p>
      <p className="text-xs text-portal-muted">{caption}</p>
    </div>
  );
}

// The free plan's teaser on a forwarder panel: no figures at all.
function MarketReportTeaser({ tier, href }: { tier: PortalLoad["tier"]; href: string }) {
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-portal-teal bg-white px-5 py-4">
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-wide text-portal-teal">Market Report · this freight forwarder project</p>
        <p className="text-sm text-portal-ink">
          {tier === "market_report"
            ? "Your Market Report for this project is being prepared."
            : "Every forwarder behind this recommendation: the full price range, transit times and why each was or wasn't picked. Part of the paid Market Report."}
        </p>
      </div>
      <Link href={href} className="text-sm font-semibold text-move-navy underline">
        {tier === "market_report" ? "About your Market Report" : "About the Market Report"}
      </Link>
    </div>
  );
}

export function StatusLegend({ contactNames }: { contactNames: string[] }) {
  return (
    <section id="legend" aria-labelledby="legend-title" className="flex flex-col gap-2 rounded-2xl border border-neutral-border bg-white p-5 text-sm text-portal-ink">
      <h2 id="legend-title" className="font-display text-base font-bold">What the stages and labels mean</h2>
      <ol className="flex flex-col gap-1">
        {CLIENT_STAGES.map((s) => (
          <li key={s.stage}>
            <span className="font-semibold">
              {s.stage}. {s.label}:
            </span>{" "}
            {s.meaning}
          </li>
        ))}
      </ol>
      <p>
        <span className="font-semibold">Estimates:</span> figures are based on quotes received, not offers; final costs
        depend on the signed agreement.
      </p>
      <p>
        <span className="font-semibold">Like-for-like:</span> quoted on the same delivery terms as yours. Quotes on other
        terms are shown greyed as &ldquo;not directly comparable&rdquo; and never counted as the best.
      </p>
      <p>
        <span className="font-semibold">Questions:</span>{" "}
        {contactNames.length ? `reply to your Move contact (${contactNames.join(", ")}).` : "reply to your Move contact."}
      </p>
    </section>
  );
}

export function PortalHome({
  data,
  today,
  greetingName,
  reportHref,
  summaryHref,
}: {
  data: PortalLoad;
  today: string;
  greetingName: string | null;
  reportHref: string;
  summaryHref: string;
}) {
  const { engagements, contactNames, tier } = data;
  const updated = lastUpdated(engagements);
  const hello = greetingName ? `Hello, ${greetingName}` : "Hello";

  if (engagements.length === 0) {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <ViewSwitch current="summary" summaryHref={summaryHref} reportHref={reportHref} tier={tier} />
        <h1 className="font-display text-3xl font-extrabold text-move-navy">{hello}</h1>
        <div className="rounded-2xl border border-neutral-border bg-white p-6 text-portal-ink">
          <p className="text-lg font-semibold">Your Move team is getting started.</p>
          <p className="mt-1 text-sm">Your first update will appear here soon.</p>
          {contactNames.length > 0 && <p className="mt-3 text-sm text-portal-muted">Your Move contact: {contactNames.join(", ")}</p>}
        </div>
        <StatusLegend contactNames={contactNames} />
      </div>
    );
  }

  const figures = keyFigures(engagements);
  const timeline = buildTimeline(engagements, today);
  const panels = Object.fromEntries(
    engagements.map((e) => [
      e.key,
      <div key={e.key}>
        <ProjectPanel update={e.latest} today={today} />
        {e.kind === "forwarder" && <MarketReportTeaser tier={tier} href={reportHref} />}
      </div>,
    ]),
  );
  const recent = engagements
    .flatMap((e) => e.history.map((v) => ({ e, v })))
    .sort((a, b) => b.v.publishedAt!.localeCompare(a.v.publishedAt!))
    .slice(0, 8);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <ViewSwitch current="summary" summaryHref={summaryHref} reportHref={reportHref} tier={tier} />
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h1 className="font-display text-3xl font-extrabold text-move-navy">{hello}</h1>
        {updated && (
          <p className="text-sm text-portal-muted">
            Last updated <LocalDate timestamp={updated.publishedAt} />
            {updated.author ? ` · ${updated.author}, Move` : " · Move"}
          </p>
        )}
      </div>

      <section aria-label="Key figures" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Figure value={String(figures.active)} label="Active projects" caption="Projects Move is working on for you." />
        <Figure value={String(figures.waiting)} label="Waiting on you" caption="Decisions or information we need from you." />
        <Figure
          value={figures.contacted == null ? "—" : String(figures.contacted)}
          label="Partners contacted"
          caption="3PLs and forwarders we've contacted for you."
        />
        <Figure
          value={figures.bestSaving ? `${percent(figures.bestSaving.pct)} below` : "—"}
          label="Best saving so far"
          caption={figures.bestSaving ? `Against what you pay today · ${figures.bestSaving.context}` : "Savings appear once we have comparable quotes."}
        />
      </section>

      <EngagementSwitcher tiles={engagements.map((e) => tileFor(e, today))} panels={panels} needs={needsYou(engagements, today)} />

      {timeline && (
        <section className="rounded-2xl border border-neutral-border bg-white p-5">
          <PortalTimeline timeline={timeline} />
        </section>
      )}

      <section aria-labelledby="recent" className="flex flex-col gap-3 rounded-2xl border border-neutral-border bg-white p-5">
        <h2 id="recent" className="font-display text-base font-bold text-portal-ink">Recent updates</h2>
        <ul className="flex flex-col gap-2">
          {recent.map(({ e, v }, i) => (
            <li key={`${e.key}-${i}`} className="border-b border-neutral-border pb-2 last:border-0">
              <details>
                <summary className="flex cursor-pointer flex-wrap gap-x-3 text-sm text-portal-ink">
                  <span className="font-semibold">
                    <LocalDate timestamp={v.publishedAt!} />
                  </span>
                  <span className={e.kind === "forwarder" ? "text-portal-teal" : "text-portal-purple"}>
                    {kindLabel(e.kind)}
                    {v.payload.project.route ? ` · ${v.payload.project.route}` : ""}
                  </span>
                  <span className="min-w-0 break-words font-medium">{v.headline}</span>
                </summary>
                <p className="mt-2 text-sm whitespace-pre-line text-portal-ink">{v.summary}</p>
                <p className="mt-1 text-xs text-portal-muted">
                  Stage {v.stage} of 7 · {stageLabel(v.stage)}
                  {v.nextStep ? ` · Next: ${nextStepText(v, today)}` : ""}
                </p>
              </details>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="questions" className="rounded-2xl border border-neutral-border bg-white p-5 text-sm text-portal-ink">
        <h2 id="questions" className="font-display text-base font-bold">Your questions</h2>
        <p className="mt-1">
          Soon you&apos;ll be able to ask Move a question and approve recommendations here. For now, reply to your Move
          contact{contactNames.length ? ` (${contactNames.join(", ")})` : ""}.
        </p>
      </section>

      <StatusLegend contactNames={contactNames} />

      {data.unreadable > 0 && (
        <p className="text-xs text-portal-muted">Some older updates can&apos;t be shown here. Ask your Move contact if you need them.</p>
      )}
      <footer className="border-t border-neutral-border pt-4 text-xs text-portal-muted">
        {ESTIMATES_FOOTER} Today is {formatDateOnly(today)} (UTC).
      </footer>
    </div>
  );
}

// /portal/market-report until 2c: static text only, no report data.
export function MarketReportPlaceholder({ tier, summaryHref, reportHref }: { tier: PortalLoad["tier"]; summaryHref: string; reportHref: string }) {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <ViewSwitch current="report" summaryHref={summaryHref} reportHref={reportHref} tier={tier} />
      <h1 className="font-display text-3xl font-extrabold text-move-navy">Market Report</h1>
      {tier === "market_report" ? (
        <div className="rounded-2xl border border-neutral-border bg-white p-6 text-portal-ink">
          <p className="text-lg font-semibold">Your Market Report is being prepared.</p>
          <p className="mt-1 text-sm">
            It will show every partner we evaluated for your freight forwarder projects: the full price range, transit
            times and what happened to each. We&apos;ll let you know when it&apos;s ready.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border-2 border-dashed border-portal-line bg-white p-6 text-portal-ink">
          <p className="text-xs font-bold uppercase tracking-wide text-portal-muted">
            Locked · paid plan
          </p>
          <p className="mt-2 text-lg font-semibold">See the whole market behind each recommendation</p>
          <ul className="mt-2 ml-5 list-disc text-sm">
            <li>Every forwarder we contacted, with exact prices and transit times</li>
            <li>Where your current cost sits in the market</li>
            <li>What happened to each forwarder, and why</li>
          </ul>
          <p className="mt-3 text-sm text-portal-muted">
            The Market Report is part of the paid plan. Ask your Move contact to find out more.
          </p>
        </div>
      )}
    </div>
  );
}

import { usd } from "@/lib/client-updates/portal-text";
import { isNotTakenForward, type MarketReportPayload } from "@/lib/client-updates/market-report-schema";
import {
  leadText,
  offScaleText,
  OUTCOME_GROUP_LABELS,
  OUTCOME_LABELS,
  partnerName,
  positionTitle,
  priceText,
  profileText,
  reportFigures,
  vsTodayText,
} from "@/lib/client-updates/market-report-view";
import { introductionsByLabel, type ClientRequestView } from "@/lib/client-requests/requests";
import { ChartFrame } from "./chart-frame";
import { LocalDate } from "./local-date";
import { ReportPartnerTable, type PartnerRowView } from "./report-partner-table";

// The paid Market Report (Paid.dc.html), drawn only from the report's
// payload. Used by the portal, staff "View as client" and the publish
// preview, so all three show the same. The portal and "View as client" pass
// `introductions` (the client's requests): lettered rows that were quoted or
// asked to quote get "Request introduction" (client) or what was asked. PDF
// and spreadsheet downloads come later.

// Rows a client can ask to be introduced to: anonymised ones that were
// quoted or asked to quote (the database checks the same list).
const INTRODUCIBLE = new Set(["quoted_not_selected", "quote_expired", "different_terms", "didnt_quote"]);

const CONTEXT_PREFIX = "Freight forwarder project · Market Report";

function Figure({ label, value, caption }: { label: string; value: string; caption: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-2xl border border-neutral-border bg-white p-4">
      <p className="text-sm text-portal-muted">{label}</p>
      <p className="font-display text-2xl font-extrabold break-words text-portal-ink">{value}</p>
      <p className="text-xs text-portal-muted">{caption}</p>
    </div>
  );
}

function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

export function MarketReportView({
  payload,
  publishedAt,
  introductions,
}: {
  payload: MarketReportPayload;
  publishedAt: string | null;
  introductions?: { engagementKey: string; mode: "client" | "view"; requests: ClientRequestView[] };
}) {
  const asked = introductions ? introductionsByLabel(introductions.requests, introductions.engagementKey) : null;
  const f = reportFigures(payload);
  const route = payload.project.route;
  const context = route ? `${CONTEXT_PREFIX} · ${route}` : CONTEXT_PREFIX;
  const named = payload.partners.filter((p) => "name" in p).length;
  const anonymous = payload.partners.length - named;
  const offScale = offScaleText(f);

  // The dot plot's scale: the comparable quotes and today, with a margin.
  const points = [...f.likeForLike, ...(f.today != null ? [f.today] : [])];
  const lo = points.length ? Math.min(...points) * 0.95 : 0;
  const hi = points.length ? Math.max(...points) * 1.05 : 1;
  const at = (x: number) => `${(((x - lo) / (hi - lo || 1)) * 100).toFixed(2)}%`;
  const dots = payload.partners.filter((p) => !isNotTakenForward(p) && p.likeForLike && p.priceUsd != null);
  // Quotes at the same price are stacked so each dot stays visible.
  const priceOf = (i: number) => (dots[i] as { priceUsd: number }).priceUsd;
  const stackOffset = (i: number) => {
    const same = dots.map((_, j) => j).filter((j) => priceOf(j) === priceOf(i));
    return (same.indexOf(i) - (same.length - 1) / 2) * 20;
  };

  const rows: PartnerRowView[] = payload.partners.map((p, i) => ({
    key: `${i}`,
    name: partnerName(p),
    named: "name" in p,
    profile: profileText(p),
    price: priceText(p),
    vs: vsTodayText(p, f.today),
    lead: leadText(p),
    take: isNotTakenForward(p) ? null : p.take,
    outcome: OUTCOME_LABELS[p.outcome],
    likeForLike: !isNotTakenForward(p) && p.likeForLike && p.priceUsd != null,
    intro:
      asked && "label" in p && INTRODUCIBLE.has(p.outcome)
        ? {
            letter: p.label.slice("Partner ".length),
            requested: (() => {
              const r = asked.get(p.label);
              return r ? { status: r.status, from: r.from } : null;
            })(),
          }
        : null,
  }));
  const maxCount = Math.max(1, ...f.counts.map((c) => c.count));

  return (
    <article className="flex min-w-0 flex-col gap-6" aria-label="Market Report">
      <header className="flex flex-col gap-1">
        <p className="text-xs font-bold uppercase tracking-wide text-portal-teal">{CONTEXT_PREFIX}</p>
        <h2 className="font-display text-2xl font-extrabold break-words text-move-navy">{route ?? "Your forwarder search"}</h2>
        <p className="text-sm text-portal-muted">
          {[...payload.project.facts].join(" · ")}
          {payload.project.facts.length ? ". " : ""}
          Prepared by {payload.author.firstName ? `${payload.author.firstName}, Move` : "Move"}
          {publishedAt ? (
            <>
              {" "}
              on <LocalDate timestamp={publishedAt} />
            </>
          ) : null}
          .
        </p>
      </header>

      <section aria-labelledby="report-how" className="rounded-2xl border border-neutral-border bg-white p-5 text-sm text-portal-ink">
        <h3 id="report-how" className="font-display text-base font-bold">How to read this report</h3>
        <p className="mt-1">
          This is everything we found while sourcing your forwarder.{" "}
          {named > 0 ? `Your ${plural(named, "shortlisted forwarder")} ${named === 1 ? "is" : "are"} named. ` : ""}
          {anonymous > 0
            ? "The others are shown as Partner D, Partner E and so on to protect their confidentiality, and their profiles are rounded to a size and a region so they can't be identified."
            : ""}
        </p>
      </section>

      <section aria-label="Market figures" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Figure label="Forwarders contacted" value={String(f.contacted)} caption={`${f.priced} gave a price we could use.`} />
        <Figure
          label="Like-for-like quotes"
          value={String(f.likeForLike.length)}
          caption={
            f.offScale.length
              ? `Same terms as yours. ${plural(f.offScale.length, "other quote")} ${f.offScale.length === 1 ? "isn't" : "aren't"} comparable.`
              : "Same terms as yours."
          }
        />
        <Figure
          label="Market range per shipment"
          value={f.range ? `${usd(f.range.min)}–${usd(f.range.max)}` : "—"}
          caption={f.median != null ? `Middle of the market (median): ${usd(f.median)}.` : "Shown once there are at least two comparable quotes."}
        />
        <Figure
          label="What you pay today"
          value={f.today != null ? usd(f.today) : "—"}
          caption={
            f.cheaperThanToday != null
              ? f.cheaperThanToday === 0
                ? "Less than every comparable quote."
                : f.cheaperThanToday === f.likeForLike.length
                  ? "More than every comparable quote."
                  : `More than ${f.cheaperThanToday} of the ${f.likeForLike.length} comparable quotes.`
              : f.today == null
                ? "We don't have your current cost yet."
                : "Compared once there are at least two comparable quotes."
          }
        />
      </section>

      {f.range && (
        <section className="rounded-2xl border border-neutral-border bg-white p-5">
          <ChartFrame
            context={context}
            title={positionTitle(f)}
            caption="Each dot is one like-for-like quote per shipment. Further left is cheaper. The dashed line is what you pay today; the dotted line is the median."
            chart={
              <div className="flex flex-col gap-3">
                <div className="relative h-24 rounded-lg bg-neutral-bg" aria-hidden="true">
                  {f.today != null && (
                    <div className="absolute inset-y-2 border-l-2 border-dashed border-portal-ink" style={{ left: at(f.today) }}>
                      <span className="absolute -top-1 left-1 text-[11px] font-semibold whitespace-nowrap text-portal-ink">Today {usd(f.today)}</span>
                    </div>
                  )}
                  {f.median != null && (
                    <div className="absolute inset-y-2 border-l-2 border-dotted border-portal-muted" style={{ left: at(f.median) }}>
                      {/* Left of its line, so it never runs into "Today" (above the median here). */}
                      <span
                        className={`absolute bottom-0 text-[11px] whitespace-nowrap text-portal-muted ${f.today != null && f.today < f.median ? "left-1" : "right-1"}`}
                      >
                        Median {usd(f.median)}
                      </span>
                    </div>
                  )}
                  {dots.map((p, i) => (
                    <span
                      key={i}
                      title={`${partnerName(p)}: ${priceText(p)}`}
                      className={
                        "absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 " +
                        (p.outcome === "recommended"
                          ? "border-portal-teal bg-portal-teal"
                          : p.outcome === "shortlisted"
                            ? "border-portal-teal bg-white"
                            : "border-portal-muted bg-portal-line")
                      }
                      style={{ left: at((p as { priceUsd: number }).priceUsd), top: `calc(50% + ${stackOffset(i)}px)` }}
                    />
                  ))}
                </div>
                <div className="flex justify-between text-xs text-portal-muted" aria-hidden="true">
                  <span>{usd(Math.round(lo))}</span>
                  <span>{usd(Math.round((lo + hi) / 2))}</span>
                  <span>{usd(Math.round(hi))}</span>
                </div>
                <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-portal-ink">
                  <li className="flex items-center gap-1.5">
                    <span className="size-3 rounded-full border-2 border-portal-teal bg-portal-teal" aria-hidden="true" />
                    Recommended
                  </li>
                  <li className="flex items-center gap-1.5">
                    <span className="size-3 rounded-full border-2 border-portal-teal bg-white" aria-hidden="true" />
                    Shortlisted backups
                  </li>
                  <li className="flex items-center gap-1.5">
                    <span className="size-3 rounded-full border-2 border-portal-muted bg-portal-line" aria-hidden="true" />
                    Other comparable quotes
                  </li>
                </ul>
              </div>
            }
            table={
              <table className="w-full text-left text-sm text-portal-ink">
                <thead className="text-xs text-portal-muted">
                  <tr>
                    <th scope="col" className="py-1 pr-3 font-semibold">Forwarder</th>
                    <th scope="col" className="py-1 pr-3 text-right font-semibold">Per shipment</th>
                    <th scope="col" className="py-1 font-semibold">vs. today</th>
                  </tr>
                </thead>
                <tbody>
                  {dots.map((p, i) => (
                    <tr key={i} className="border-t border-neutral-border">
                      <th scope="row" className="py-1 pr-3 font-medium">{partnerName(p)}</th>
                      <td className="py-1 pr-3 text-right tabular-nums">{priceText(p)}</td>
                      <td className="py-1">{vsTodayText(p, f.today)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            }
          />
          {offScale && <p className="mt-3 text-sm text-portal-muted">{offScale}</p>}
        </section>
      )}

      <section aria-labelledby="report-outcomes" className="rounded-2xl border border-neutral-border bg-white p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-portal-muted">{context}</p>
        <h3 id="report-outcomes" className="mt-0.5 text-base font-bold text-portal-ink">
          What happened to all {f.contacted} forwarders
        </h3>
        <p className="text-sm text-portal-muted">How we narrowed the field. Bar length is the number of forwarders.</p>
        <dl className="mt-3 flex flex-col gap-2">
          {f.counts.map((c) => (
            <div key={c.outcome} className="grid grid-cols-[minmax(0,11rem)_minmax(0,1fr)] items-center gap-3 text-sm max-sm:grid-cols-1 max-sm:gap-1">
              <dt className="text-portal-ink">{OUTCOME_GROUP_LABELS[c.outcome]}</dt>
              <dd className="m-0 flex items-center gap-2">
                <span
                  className={`h-3 rounded-full ${c.outcome === "recommended" || c.outcome === "shortlisted" ? "bg-portal-teal" : "bg-portal-line"}`}
                  style={{ width: `${(c.count / maxCount) * 100}%`, minWidth: "0.75rem" }}
                  aria-hidden="true"
                />
                <span className="font-semibold tabular-nums text-portal-ink">{c.count}</span>
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="report-all" className="flex min-w-0 flex-col gap-2 rounded-2xl border border-neutral-border bg-white p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-portal-muted">{context}</p>
        <h3 id="report-all" className="text-base font-bold text-portal-ink">Every forwarder we evaluated</h3>
        <p className="text-sm text-portal-muted">
          Prices are per shipment in US dollars, as quoted.
          {f.today != null ? ` "vs. today" compares like-for-like quotes with your current ${usd(f.today)}.` : ""}
        </p>
        <ReportPartnerTable
          rows={rows}
          caption={`All forwarders contacted${route ? ` for ${route}` : ""}`}
          introductions={introductions ? { engagementKey: introductions.engagementKey, mode: introductions.mode } : undefined}
        />
      </section>

      <footer className="border-t border-neutral-border pt-4 text-xs text-portal-muted">
        <p>
          <span className="font-semibold">About these figures.</span> Prices are as quoted and are indicative, not offers.
          Partner names outside your shortlist are withheld, and their profiles rounded, to protect their confidentiality.
        </p>
        <p className="mt-1">This report is for your company only. Please don&apos;t share it outside your company.</p>
      </footer>
    </article>
  );
}

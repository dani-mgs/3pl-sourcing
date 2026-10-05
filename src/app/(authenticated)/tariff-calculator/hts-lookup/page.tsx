import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatRateDate } from "@/lib/fx/rate-provenance";
import { formatHtsCode } from "@/lib/tariff/hts-code";
import {
  buildBrowseTree,
  buildPath,
  calculatorHref,
  crossRulingsUrl,
  groupByHeading,
  lookupHref,
  parseLookupQuery,
  projectLinkFrom,
  releaseLabel,
  stepText,
  LOOKUP_GUARDRAIL,
} from "@/lib/tariff/hts-lookup";
import { browseHeading, loadCurrentRelease, searchHts, type LookupResult } from "@/lib/tariff/server-hts-lookup";
import { WARNING_BOX_CLASS } from "../estimate-result";
import { BrowseTree } from "./browse-tree";
import { LineFacts, linkClass } from "./hts-line";

const one = (value: string | string[] | undefined) => (typeof value === "string" ? value : undefined);

function CrossLink({ heading }: { heading: string }) {
  return (
    <a href={crossRulingsUrl(heading)} target="_blank" rel="noopener noreferrer" className={`${linkClass} inline-flex items-center gap-1 text-xs`}>
      CBP rulings for {formatHtsCode(heading)} (CROSS)
      <ExternalLink aria-hidden="true" className="size-3" />
      <span className="sr-only">, opens in a new tab</span>
    </a>
  );
}

// HTS code lookup: find candidate lines in the current HTS release by
// keyword or code, or browse a heading. Any signed-in user; read-only. It
// never classifies a product: results are in code order, not ranked.
// Opened with ?project=<id>[&quote=<id>] from a linked estimate, "Use this
// code" returns to it.
export default async function HtsLookupPage({ searchParams }: PageProps<"/tariff-calculator/hts-lookup">) {
  const params = await searchParams;
  const link = projectLinkFrom(one(params.project), one(params.quote));
  const rawQuery = one(params.q) ?? "";
  const query = parseLookupQuery(rawQuery);
  const headingParam = one(params.heading);
  const heading = headingParam && /^[0-9]{4}$/.test(headingParam) ? headingParam : null;
  const highlight = one(params.line) ?? null;

  const supabase = await createClient();
  const release = await loadCurrentRelease(supabase);

  let result: LookupResult | null = null;
  let failed = false;
  if (release) {
    try {
      if (heading) result = await browseHeading(supabase, heading);
      else if (query.kind === "code" || query.kind === "keywords") result = await searchHts(supabase, query);
    } catch (error) {
      console.error("HtsLookupPage search error:", error);
      failed = true;
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-8 py-10 max-sm:px-4">
      <Link
        href={calculatorHref(link)}
        className="mb-4 inline-flex items-center gap-1.5 rounded text-sm text-neutral-muted outline-none hover:text-move-navy focus-visible:ring-2 focus-visible:ring-move-green"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        {link ? "Back to the linked estimate" : "Tariff Calculator"}
      </Link>
      <h1 className="font-display text-2xl font-semibold text-move-navy">Look up HTS code</h1>
      <p className="mt-1 text-sm text-neutral-muted">
        {release ? (
          <>
            Searching HTSUS {releaseLabel(release)}
            {release.release_start_date && <>, effective {formatRateDate(release.release_start_date)}</>}.
          </>
        ) : (
          "No HTS release has been imported yet, so there's nothing to search."
        )}
      </p>

      <p className={`${WARNING_BOX_CLASS} mt-4`} role="note" data-testid="lookup-guardrail">
        {LOOKUP_GUARDRAIL}
      </p>

      <section className="mt-6 rounded-2xl border border-neutral-border bg-white p-6 shadow-sm">
        <form action="/tariff-calculator/hts-lookup" method="get" role="search" className="flex flex-col gap-2">
          <label htmlFor="hts_lookup_q" className="text-sm font-medium text-move-navy">
            Words or an HTS code
          </label>
          <div className="flex flex-wrap gap-2">
            <input
              // Remount on a new search so the box shows it.
              key={rawQuery}
              id="hts_lookup_q"
              name="q"
              type="search"
              defaultValue={rawQuery}
              maxLength={100}
              autoComplete="off"
              placeholder="e.g. footwear rubber, or 6402.99"
              aria-describedby="hts_lookup_tips"
              disabled={!release}
              className="min-w-0 flex-1 rounded-lg border border-neutral-border px-3 py-2 text-sm text-move-navy outline-none focus-visible:ring-2 focus-visible:ring-move-green"
            />
            {link && <input type="hidden" name="project" value={link.project} />}
            {link?.quote && <input type="hidden" name="quote" value={link.quote} />}
            <button
              type="submit"
              disabled={!release}
              className="rounded-lg bg-move-navy px-4 py-2 text-sm font-medium text-white outline-none hover:bg-move-navy/90 focus-visible:ring-2 focus-visible:ring-move-green disabled:opacity-50"
            >
              Search
            </button>
          </div>
          <div id="hts_lookup_tips" className="text-xs text-neutral-muted">
            <p className="font-medium">Search tips</p>
            <ul className="mt-0.5 list-disc pl-5">
              <li>Tariff wording is formal: try &ldquo;footwear&rdquo;, not &ldquo;shoes&rdquo;.</li>
              <li>Try the material and the product type, e.g. &ldquo;cotton shirts&rdquo; or &ldquo;steel screws&rdquo;.</li>
              <li>Try the 4-digit heading (e.g. 6402) to see everything under it.</li>
              <li>Words match from their start (&ldquo;foot&rdquo; finds &ldquo;footwear&rdquo;); common words like &ldquo;other&rdquo; are ignored.</li>
            </ul>
          </div>
        </form>
      </section>

      {query.kind === "invalid" && !heading && (
        <p className={`${WARNING_BOX_CLASS} mt-6`} role="alert">
          {query.error}
        </p>
      )}
      {failed && (
        <p className={`${WARNING_BOX_CLASS} mt-6`} role="alert">
          The search didn&apos;t work. Try again, or try different words.
        </p>
      )}

      {result && heading && <BrowseSection heading={heading} result={result} link={link} highlight={highlight} rawQuery={rawQuery} />}
      {result && !heading && <SearchResults result={result} link={link} rawQuery={rawQuery} />}
    </div>
  );
}

function SearchResults({
  result,
  link,
  rawQuery,
}: {
  result: LookupResult;
  link: ReturnType<typeof projectLinkFrom>;
  rawQuery: string;
}) {
  if (result.lines.length === 0) {
    return (
      <p className="mt-6 rounded-2xl border border-neutral-border bg-white p-6 text-sm text-neutral-muted shadow-sm" role="status">
        No lines found. Tariff wording is formal (&ldquo;footwear&rdquo;, not &ldquo;shoes&rdquo;), common words like
        &ldquo;other&rdquo; are ignored, and every word must appear. Try fewer or more formal words, or a heading code.
      </p>
    );
  }
  const groups = groupByHeading(result.lines);
  return (
    <section className="mt-6" aria-label="Search results">
      <p className="mb-3 text-sm text-neutral-muted" role="status">
        {result.total > result.lines.length ? (
          <>
            Showing the first {result.lines.length} of {result.total} lines, in code order.{" "}
            <span className="font-medium text-[#92400E]">Too many to list: refine your search</span> (add a word, or search
            a heading code).
          </>
        ) : (
          <>
            {result.total} line{result.total === 1 ? "" : "s"}, in code order (not ranked).
          </>
        )}
      </p>
      <div className="flex flex-col gap-4">
        {groups.map((group) => (
          <article key={group.heading} className="rounded-2xl border border-neutral-border bg-white p-5 shadow-sm">
            <header className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-neutral-border pb-3">
              <h2 className="text-sm text-move-navy">
                <span className="mr-2 font-semibold tabular-nums">{group.heading}</span>
                {group.description ? stepText(group.description) : `Heading ${group.heading}`}
              </h2>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                <Link href={lookupHref(link, { heading: group.heading, q: rawQuery })} className={`${linkClass} text-xs`}>
                  Browse heading
                </Link>
                <CrossLink heading={group.heading} />
              </div>
            </header>
            <ul className="flex flex-col divide-y divide-neutral-border">
              {group.lines.map((line) => {
                const steps = buildPath(line);
                return (
                  <li key={line.hts_code} className="py-3 first:pt-0 last:pb-0">
                    <p className="text-xs text-neutral-muted">
                      {steps.slice(0, -1).map((step, i) => (
                        <span key={i}>
                          {step.code && step.code.length > 2 && <span className="tabular-nums">{formatHtsCode(step.code)} </span>}
                          {stepText(step.description)} ›{" "}
                        </span>
                      ))}
                    </p>
                    <p className="text-sm text-move-navy">
                      <Link
                        href={lookupHref(link, { heading: line.hts_code.slice(0, 4), line: line.hts_code, q: rawQuery })}
                        className={`${linkClass} mr-2 font-semibold tabular-nums`}
                      >
                        {formatHtsCode(line.hts_code)}
                      </Link>
                      {line.description}
                    </p>
                    <LineFacts line={line} link={link} />
                  </li>
                );
              })}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}

function BrowseSection({
  heading,
  result,
  link,
  highlight,
  rawQuery,
}: {
  heading: string;
  result: LookupResult;
  link: ReturnType<typeof projectLinkFrom>;
  highlight: string | null;
  rawQuery: string;
}) {
  const headingLine = result.lines.find((l) => l.hts_code === heading);
  return (
    <section className="mt-6 rounded-2xl border border-neutral-border bg-white p-6 shadow-sm" aria-label={`Heading ${heading}`}>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="font-display text-lg font-semibold text-move-navy">
          Chapter {heading.slice(0, 2)} › Heading {heading}
        </h2>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {rawQuery && (
            <Link href={lookupHref(link, { q: rawQuery })} className={`${linkClass} text-xs`}>
              Back to results
            </Link>
          )}
          <CrossLink heading={heading} />
        </div>
      </div>
      {result.lines.length === 0 || !headingLine ? (
        <p className="text-sm text-neutral-muted" role="status">
          Heading {heading} isn&apos;t in the current HTS release.
        </p>
      ) : (
        <>
          {result.total > result.lines.length && (
            <p className={`${WARNING_BOX_CLASS} mb-4 text-xs`}>
              Showing the first {result.lines.length} of {result.total} lines. Search a 6-digit subheading to see the rest.
            </p>
          )}
          <BrowseTree nodes={buildBrowseTree(result.lines)} link={link} highlight={highlight} />
        </>
      )}
    </section>
  );
}

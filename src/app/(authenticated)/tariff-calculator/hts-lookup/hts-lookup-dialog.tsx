"use client";

import { useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { ExternalLink } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { formatHtsCode } from "@/lib/tariff/hts-code";
import {
  LOOKUP_GUARDRAIL,
  buildBrowseTree,
  buildPath,
  crossRulingsUrl,
  groupByHeading,
  stepText,
  type LookupLine,
} from "@/lib/tariff/hts-lookup";
import { browseHtsHeadingAction, searchHtsAction } from "../hts-lookup-actions";
import { BrowseTree } from "./browse-tree";
import { LineFacts, linkClass } from "./hts-line";

export type LookupRelease = { label: string; effective: string | null };

type Found = { lines: LookupLine[]; total: number };
type Browse = Found & { heading: string };

const WARNING_CLASS = "rounded-xl border border-[#FBBF24] bg-[#FFFBEB] px-4 py-3 text-sm text-[#92400E]";

function CrossLink({ heading }: { heading: string }) {
  return (
    <a
      href={crossRulingsUrl(heading)}
      target="_blank"
      rel="noopener noreferrer"
      className={`${linkClass} inline-flex items-center gap-1 text-xs`}
    >
      CBP rulings for {formatHtsCode(heading)} (CROSS)
      <ExternalLink aria-hidden="true" className="size-3" />
      <span className="sr-only">, opens in a new tab</span>
    </a>
  );
}

// HTS code lookup in a popup beside the calculator form: search by words or
// code, or browse a heading, then "Use this code" hands the line to onPick
// and closes. It never navigates, and it's rendered outside the <form> (its
// events must not reach the form): search runs on Enter or the Search button
// only, every button is type="button", and nothing here writes anywhere.
// Query and results stay in this component's state, so closing and
// reopening keeps them. Search and browse are server actions (user-scoped,
// validated there).
export function HtsLookupDialog({
  open,
  onOpenChange,
  release,
  onPick,
  finalFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Null when no HTS release has been imported yet.
  release: LookupRelease | null;
  onPick: (line: LookupLine) => void;
  // The "Look up code" button, which gets focus back on close.
  finalFocus: RefObject<HTMLElement | null>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [searched, setSearched] = useState<Found | null>(null);
  const [browse, setBrowse] = useState<Browse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run<T>(task: () => Promise<{ ok: true } & T | { ok: false; error: string }>, done: (value: T) => void) {
    setBusy(true);
    setError(null);
    try {
      const result = await task();
      if (result.ok) done(result);
      else setError(result.error);
    } catch {
      setError("The search didn't work. Try again, or try different words.");
    } finally {
      setBusy(false);
    }
  }

  const search = () =>
    run(
      () => searchHtsAction(query),
      (r) => {
        setSearched({ lines: r.lines, total: r.total });
        setBrowse(null);
      },
    );

  const browseHeading = (heading: string) =>
    run(
      () => browseHtsHeadingAction(heading),
      (r) => setBrowse({ heading, lines: r.lines, total: r.total }),
    );

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    event.stopPropagation();
    if (!busy) void search();
  }

  function pick(line: LookupLine) {
    onPick(line);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        initialFocus={inputRef}
        finalFocus={finalFocus}
        className="top-2 left-2 h-[calc(100dvh-1rem)] max-w-none translate-x-0 translate-y-0 grid-rows-[auto_minmax(0,1fr)] gap-3 p-4 sm:top-1/2 sm:left-1/2 sm:h-[85vh] sm:max-w-3xl sm:-translate-x-1/2 sm:-translate-y-1/2 max-sm:w-[calc(100%-1rem)]"
      >
        <div className="flex flex-col gap-2 pr-8">
          <DialogTitle className="font-display text-lg font-semibold text-move-navy">Look up HTS code</DialogTitle>
          <DialogDescription className="text-xs text-neutral-muted">
            {release ? (
              <>
                Searching HTSUS {release.label}
                {release.effective && <>, effective {release.effective}</>}.
              </>
            ) : (
              "No HTS release has been imported yet, so there's nothing to search."
            )}
          </DialogDescription>
          <p className={`${WARNING_CLASS} text-xs`} role="note" data-testid="lookup-guardrail">
            {LOOKUP_GUARDRAIL}
          </p>
          <div className="flex flex-wrap gap-2">
            <label htmlFor="hts_lookup_q" className="sr-only">
              Words or an HTS code
            </label>
            <input
              ref={inputRef}
              id="hts_lookup_q"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              maxLength={100}
              autoComplete="off"
              placeholder="Words or a code, e.g. footwear rubber, or 6402.99"
              aria-describedby="hts_lookup_tips"
              disabled={!release}
              className="min-w-0 flex-1 rounded-lg border border-neutral-border px-3 py-2 text-sm text-move-navy outline-none focus-visible:ring-2 focus-visible:ring-move-green"
            />
            <button
              type="button"
              onClick={() => void search()}
              disabled={!release || busy}
              className="rounded-lg bg-move-navy px-4 py-2 text-sm font-medium text-white outline-none hover:bg-move-navy/90 focus-visible:ring-2 focus-visible:ring-move-green disabled:opacity-50"
            >
              {busy ? "Searching…" : "Search"}
            </button>
          </div>
          <details id="hts_lookup_tips" className="text-xs text-neutral-muted">
            <summary className="cursor-pointer font-medium outline-none focus-visible:ring-2 focus-visible:ring-move-green">
              Search tips
            </summary>
            <ul className="mt-1 list-disc pl-5">
              <li>Tariff wording is formal: try &ldquo;footwear&rdquo;, not &ldquo;shoes&rdquo;.</li>
              <li>Try the material and the product type, e.g. &ldquo;cotton shirts&rdquo; or &ldquo;steel screws&rdquo;.</li>
              <li>Try the 4-digit heading (e.g. 6402) to see everything under it.</li>
              <li>
                Words match from their start (&ldquo;foot&rdquo; finds &ldquo;footwear&rdquo;); common words like
                &ldquo;other&rdquo; are ignored.
              </li>
            </ul>
          </details>
        </div>

        <div className="min-h-0 overflow-y-auto pr-1" data-testid="lookup-results">
          {error && (
            <p className={WARNING_CLASS} role="alert">
              {error}
            </p>
          )}
          {browse ? (
            <BrowseView browse={browse} onBack={() => setBrowse(null)} onPick={pick} canGoBack={searched != null} />
          ) : (
            searched && <Results found={searched} onBrowse={(h) => void browseHeading(h)} onPick={pick} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Results({ found, onBrowse, onPick }: { found: Found; onBrowse: (heading: string) => void; onPick: (line: LookupLine) => void }) {
  if (found.lines.length === 0) {
    return (
      <p className="rounded-xl border border-neutral-border p-4 text-sm text-neutral-muted" role="status">
        No lines found. Tariff wording is formal (&ldquo;footwear&rdquo;, not &ldquo;shoes&rdquo;), common words like
        &ldquo;other&rdquo; are ignored, and every word must appear. Try fewer or more formal words, or a heading code.
      </p>
    );
  }
  return (
    <section aria-label="Search results">
      <p className="mb-3 text-sm text-neutral-muted" role="status">
        {found.total > found.lines.length ? (
          <>
            Showing the first {found.lines.length} of {found.total} lines, in code order.{" "}
            <span className="font-medium text-[#92400E]">Too many to list: refine your search</span> (add a word, or
            search a heading code).
          </>
        ) : (
          <>
            {found.total} line{found.total === 1 ? "" : "s"}, in code order (not ranked).
          </>
        )}
      </p>
      <div className="flex flex-col gap-3">
        {groupByHeading(found.lines).map((group) => (
          <article key={group.heading} className="rounded-xl border border-neutral-border p-4">
            <header className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-neutral-border pb-2">
              <h3 className="text-sm text-move-navy">
                <span className="mr-2 font-semibold tabular-nums">{group.heading}</span>
                {group.description ? stepText(group.description) : `Heading ${group.heading}`}
              </h3>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                <button type="button" onClick={() => onBrowse(group.heading)} className={`${linkClass} text-xs`}>
                  Browse heading
                </button>
                <CrossLink heading={group.heading} />
              </div>
            </header>
            <ul className="flex flex-col divide-y divide-neutral-border">
              {group.lines.map((line) => (
                <li key={line.hts_code} className="py-3 first:pt-0 last:pb-0">
                  <p className="text-xs text-neutral-muted">
                    {buildPath(line)
                      .slice(0, -1)
                      .map((step, i) => (
                        <span key={i}>
                          {step.code && step.code.length > 2 && <span className="tabular-nums">{formatHtsCode(step.code)} </span>}
                          {stepText(step.description)} ›{" "}
                        </span>
                      ))}
                  </p>
                  <p className="text-sm text-move-navy">
                    <span className="mr-2 font-semibold tabular-nums">{formatHtsCode(line.hts_code)}</span>
                    {line.description}
                  </p>
                  <LineFacts line={line} onPick={onPick} />
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}

function BrowseView({
  browse,
  onBack,
  onPick,
  canGoBack,
}: {
  browse: Browse;
  onBack: () => void;
  onPick: (line: LookupLine) => void;
  canGoBack: boolean;
}) {
  const hasHeading = browse.lines.some((l) => l.hts_code === browse.heading);
  return (
    <section aria-label={`Heading ${browse.heading}`}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="font-display text-base font-semibold text-move-navy">
          Chapter {browse.heading.slice(0, 2)} › Heading {browse.heading}
        </h3>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {canGoBack && (
            <button type="button" onClick={onBack} className={`${linkClass} text-xs`}>
              Back to results
            </button>
          )}
          <CrossLink heading={browse.heading} />
        </div>
      </div>
      {!hasHeading ? (
        <p className="text-sm text-neutral-muted" role="status">
          Heading {browse.heading} isn&apos;t in the current HTS release.
        </p>
      ) : (
        <>
          {browse.total > browse.lines.length && (
            <p className={`${WARNING_CLASS} mb-3 text-xs`}>
              Showing the first {browse.lines.length} of {browse.total} lines. Search a 6-digit subheading to see the
              rest.
            </p>
          )}
          <BrowseTree nodes={buildBrowseTree(browse.lines)} onPick={onPick} />
        </>
      )}
    </section>
  );
}

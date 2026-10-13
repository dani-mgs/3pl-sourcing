"use client";

import { useState, type ReactNode } from "react";

export type EngagementTile = {
  key: string;
  kind: "forwarder" | "three_pl";
  kindLabel: string;
  route: string;
  stageLine: string;
  nextLine: string | null;
  status: "needs" | "on_track" | "complete";
};

// The project tiles are buttons that choose which project's panel shows (the
// mockup's behaviour). Every panel is already on the page (they're all this
// client's own published updates), so switching fetches nothing. The
// "Review" links in the needs-you banner select a tile too.
export function EngagementSwitcher({
  tiles,
  panels,
  needs,
}: {
  tiles: EngagementTile[];
  panels: Record<string, ReactNode>;
  needs: { key: string; text: string }[];
}) {
  const [selected, setSelected] = useState(tiles[0]?.key ?? null);
  const active = tiles.filter((t) => t.status !== "complete");
  const complete = tiles.filter((t) => t.status === "complete");

  function choose(key: string) {
    setSelected(key);
    document.getElementById("portal-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const tileButton = (t: EngagementTile) => {
    const pressed = t.key === selected;
    const tone =
      t.kind === "forwarder"
        ? pressed
          ? "border-portal-teal bg-portal-teal-bg"
          : "border-neutral-border bg-white hover:border-portal-teal"
        : pressed
          ? "border-portal-purple bg-portal-purple-bg"
          : "border-neutral-border bg-white hover:border-portal-purple";
    const accent = t.kind === "forwarder" ? "text-portal-teal" : "text-portal-purple";
    return (
      <li key={t.key} className="min-w-0">
        <button
          type="button"
          aria-pressed={pressed}
          aria-controls="portal-panel"
          onClick={() => setSelected(t.key)}
          className={`flex h-full w-full min-w-0 flex-col gap-2 rounded-2xl border-2 p-4 text-left ${tone}`}
        >
          <span className="flex flex-wrap items-center justify-between gap-2">
            <span className={`text-xs font-bold uppercase tracking-wide ${accent}`}>{t.kindLabel}</span>
            <span
              className={
                "rounded-full border px-2 py-0.5 text-xs font-semibold " +
                (t.status === "needs"
                  ? "border-portal-amber bg-portal-amber-bg text-portal-amber"
                  : "border-portal-line bg-white text-portal-ink")
              }
            >
              {t.status === "needs" ? "! Needs your decision" : t.status === "complete" ? "✓ Complete" : "On track"}
            </span>
          </span>
          <span className="font-display text-base font-bold break-words text-portal-ink">{t.route}</span>
          <span className="text-sm text-portal-ink">{t.stageLine}</span>
          {t.nextLine && <span className="text-sm text-portal-muted">{t.nextLine}</span>}
          <span className="sr-only">{pressed ? "Showing below" : "Show this project"}</span>
        </button>
      </li>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      {needs.length > 0 ? (
        <section
          aria-labelledby="needs-you"
          className="flex flex-col gap-3 rounded-2xl border border-portal-amber bg-portal-amber-bg px-5 py-4"
        >
          <h2 id="needs-you" className="font-semibold text-portal-amber">
            <span aria-hidden="true">! </span>
            {needs.length === 1 ? "1 item needs you" : `${needs.length} items need you`}
          </h2>
          <ul className="flex flex-col gap-2">
            {needs.map((n) => (
              <li key={n.key} className="flex flex-wrap items-center justify-between gap-3 text-sm text-portal-ink">
                <span className="min-w-0">{n.text}</span>
                <button
                  type="button"
                  onClick={() => choose(n.key)}
                  className="min-h-11 rounded-lg bg-move-navy px-4 text-sm font-semibold text-white"
                >
                  Review now
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <p className="rounded-2xl border border-neutral-border bg-white px-5 py-4 text-sm text-portal-ink">
          Nothing needs you right now. We&apos;ll let you know.
        </p>
      )}

      <section aria-labelledby="your-projects" className="flex flex-col gap-3">
        <div>
          <h2 id="your-projects" className="font-display text-lg font-bold text-portal-ink">
            Your projects
          </h2>
          <p className="text-sm text-portal-muted">Select a project to see its details.</p>
        </div>
        {active.length > 0 && <ul className="grid gap-3 sm:grid-cols-2">{active.map(tileButton)}</ul>}
        {complete.length > 0 && (
          <>
            <h3 className="mt-2 text-sm font-semibold text-portal-muted">Completed</h3>
            <ul className="grid gap-3 sm:grid-cols-2">{complete.map(tileButton)}</ul>
          </>
        )}
      </section>

      <div id="portal-panel" className="scroll-mt-4">
        {tiles.map((t) => (
          <div key={t.key} hidden={t.key !== selected}>
            {panels[t.key]}
          </div>
        ))}
      </div>
    </div>
  );
}

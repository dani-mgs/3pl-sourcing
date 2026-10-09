"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ProjectStatusBadge } from "./project-status-badge";
import { matchesSearch } from "@/lib/search-text";

export type ForwarderProjectRow = {
  id: string;
  clientName: string;
  businessModel: string | null;
  isMine: boolean;
  ownerDisplay: string;
  route: string | null;
  mode: string | null;
  status: string;
  updatedRelative: string;
};

type Tab = "mine" | "all";

const headClass =
  "px-4 py-3 text-xs font-medium uppercase tracking-wide text-neutral-muted";

// Mirrors the 3PL project list: search, My Projects / All Experts tabs, and a
// link in every cell (never an overlay on the <tr>).
export function ForwarderProjectList({ rows }: { rows: ForwarderProjectRow[] }) {
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<Tab>("mine");

  const mineCount = useMemo(() => rows.filter((r) => r.isMine).length, [rows]);

  const filteredRows = useMemo(() => {
    const scoped = tab === "mine" ? rows.filter((r) => r.isMine) : rows;
    if (!query.trim()) return scoped;
    return scoped.filter(
      (row) =>
        matchesSearch(row.clientName, query) ||
        (row.route != null && matchesSearch(row.route, query)),
    );
  }, [rows, tab, query]);

  const tabClass = (active: boolean) =>
    active
      ? "rounded-full bg-move-green px-4 py-1.5 text-sm font-medium text-white"
      : "rounded-full border border-neutral-border px-4 py-1.5 text-sm font-medium text-neutral-muted hover:bg-neutral-bg";

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium tracking-wide text-neutral-muted uppercase">
            Forwarder Sourcing
          </p>
          <h1 className="mt-1 font-display text-2xl font-semibold text-move-navy">
            Projects
          </h1>
        </div>
        <div className="flex w-full items-center gap-3 sm:w-auto">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search clients or routes"
            aria-label="Search clients or routes"
            className="min-w-0 flex-1 rounded-xl border-neutral-border sm:w-64 sm:flex-none"
          />
          <Button
            className="whitespace-nowrap px-5 py-2.5"
            nativeButton={false}
            render={<Link href="/forwarder-sourcing/new" />}
          >
            New Project
          </Button>
        </div>
      </div>

      <div className="mb-6 flex items-center gap-2">
        <button type="button" onClick={() => setTab("mine")} className={tabClass(tab === "mine")}>
          My Projects · {mineCount}
        </button>
        <button type="button" onClick={() => setTab("all")} className={tabClass(tab === "all")}>
          All Experts · {rows.length}
        </button>
      </div>

      {filteredRows.length === 0 ? (
        <div className="rounded-2xl border border-neutral-border bg-white p-6 shadow-sm">
          <p className="py-8 text-center text-sm text-neutral-muted">
            {tab === "mine" && mineCount === 0 && !query.trim()
              ? "No forwarder projects yet. Create your first one to get started."
              : "No projects match your search."}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-neutral-border bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-neutral-border">
                <th className={headClass}>Client</th>
                <th className={headClass}>Owner</th>
                <th className={headClass}>Route</th>
                <th className={headClass}>Mode</th>
                <th className={headClass}>Status</th>
                <th className={headClass}>Updated</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => {
                const href = `/forwarder-sourcing/${row.id}`;
                return (
                  <tr
                    key={row.id}
                    className="border-b border-neutral-border last:border-b-0 hover:bg-neutral-bg"
                  >
                    <td className="p-0">
                      <Link href={href} className="block px-4 py-3">
                        <span className="block text-move-navy">{row.clientName}</span>
                        {row.businessModel && (
                          <span className="block text-xs text-neutral-muted">
                            {row.businessModel}
                          </span>
                        )}
                      </Link>
                    </td>
                    <td className="p-0">
                      <Link href={href} className="block px-4 py-3 text-neutral-muted">
                        {row.ownerDisplay}
                      </Link>
                    </td>
                    <td className="p-0">
                      <Link href={href} className="block px-4 py-3 text-neutral-muted">
                        {row.route ?? "—"}
                      </Link>
                    </td>
                    <td className="p-0">
                      <Link href={href} className="block px-4 py-3 text-neutral-muted">
                        {row.mode ?? "—"}
                      </Link>
                    </td>
                    <td className="p-0">
                      <Link href={href} className="block px-4 py-3">
                        <ProjectStatusBadge status={row.status} />
                      </Link>
                    </td>
                    <td className="p-0">
                      <Link href={href} className="block px-4 py-3 text-neutral-muted">
                        {row.updatedRelative}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

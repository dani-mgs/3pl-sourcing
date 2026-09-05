"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type DashboardRow = {
  id: string;
  clientName: string;
  businessModel: string | null;
  isMine: boolean;
  ownerDisplay: string;
  region: string | null;
  providerCount: number;
  pipelineSegments: { status: string; count: number; color: string }[];
  topStatusText: string;
  updatedRelative: string;
};

type Tab = "mine" | "all";

export function DashboardContent({ rows }: { rows: DashboardRow[] }) {
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<Tab>("mine");

  const mineCount = useMemo(() => rows.filter((r) => r.isMine).length, [rows]);
  const allCount = rows.length;

  const filteredRows = useMemo(() => {
    const scoped = tab === "mine" ? rows.filter((r) => r.isMine) : rows;

    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return scoped;

    return scoped.filter(
      (row) =>
        row.clientName.toLowerCase().includes(normalizedQuery) ||
        row.region?.toLowerCase().includes(normalizedQuery),
    );
  }, [rows, tab, query]);

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium tracking-wide text-neutral-muted uppercase">
            Sourcing Projects
          </p>
          <h1 className="mt-1 font-display text-2xl font-semibold text-move-navy">
            Projects
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search projects or clients"
            className="w-64 rounded-xl border-neutral-border"
          />
          <Button
            className="whitespace-nowrap px-5 py-2.5"
            nativeButton={false}
            render={<Link href="/dashboard/new" />}
          >
            New Project
          </Button>
        </div>
      </div>

      <div className="mb-6 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setTab("mine")}
          className={
            tab === "mine"
              ? "rounded-full bg-move-green px-4 py-1.5 text-sm font-medium text-white"
              : "rounded-full border border-neutral-border px-4 py-1.5 text-sm font-medium text-neutral-muted hover:bg-neutral-bg"
          }
        >
          My Projects · {mineCount}
        </button>
        <button
          type="button"
          onClick={() => setTab("all")}
          className={
            tab === "all"
              ? "rounded-full bg-move-green px-4 py-1.5 text-sm font-medium text-white"
              : "rounded-full border border-neutral-border px-4 py-1.5 text-sm font-medium text-neutral-muted hover:bg-neutral-bg"
          }
        >
          All Experts · {allCount}
        </button>
      </div>

      {filteredRows.length === 0 ? (
        <div className="rounded-2xl border border-neutral-border bg-white p-6 shadow-sm">
          <p className="py-8 text-center text-sm text-neutral-muted">
            {tab === "mine" && rows.filter((r) => r.isMine).length === 0
              ? "No projects yet. Create your first one to get started."
              : "No projects match your search."}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-neutral-border bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-neutral-border">
                <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-neutral-muted">
                  Client
                </th>
                <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-neutral-muted">
                  Owner
                </th>
                <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-neutral-muted">
                  Region
                </th>
                <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-neutral-muted">
                  3PLs
                </th>
                <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-neutral-muted">
                  Pipeline
                </th>
                <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-neutral-muted">
                  Updated
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-neutral-border last:border-b-0 hover:bg-neutral-bg"
                >
                  <td className="px-0 py-0">
                    <Link
                      href={`/projects/${row.id}`}
                      className="block px-4 py-3"
                    >
                      <span className="block text-move-navy">
                        {row.clientName}
                      </span>
                      {row.businessModel && (
                        <span className="block text-xs text-neutral-muted">
                          {row.businessModel}
                        </span>
                      )}
                    </Link>
                  </td>
                  <td className="px-0 py-0">
                    <Link
                      href={`/projects/${row.id}`}
                      className="block px-4 py-3 text-neutral-muted"
                    >
                      {row.ownerDisplay}
                    </Link>
                  </td>
                  <td className="px-0 py-0">
                    <Link
                      href={`/projects/${row.id}`}
                      className="block px-4 py-3 text-neutral-muted"
                    >
                      {row.region || "—"}
                    </Link>
                  </td>
                  <td className="px-0 py-0">
                    <Link
                      href={`/projects/${row.id}`}
                      className="block px-4 py-3 text-move-navy"
                    >
                      {row.providerCount}
                    </Link>
                  </td>
                  <td className="px-0 py-0">
                    <Link href={`/projects/${row.id}`} className="block px-4 py-3">
                      {row.providerCount === 0 ? (
                        <span className="text-xs text-neutral-muted">
                          {row.topStatusText}
                        </span>
                      ) : (
                        <div className="flex flex-col gap-1">
                          <div className="flex h-2 w-32 overflow-hidden rounded-full bg-neutral-border">
                            {row.pipelineSegments.map((segment) => (
                              <div
                                key={segment.status}
                                className={segment.color}
                                style={{
                                  width: `${(segment.count / row.providerCount) * 100}%`,
                                }}
                              />
                            ))}
                          </div>
                          <span className="text-xs text-neutral-muted">
                            {row.topStatusText}
                          </span>
                        </div>
                      )}
                    </Link>
                  </td>
                  <td className="px-0 py-0">
                    <Link
                      href={`/projects/${row.id}`}
                      className="block px-4 py-3 text-neutral-muted"
                    >
                      {row.updatedRelative}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

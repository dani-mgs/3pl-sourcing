"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Filter, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  CAPABILITY_FIELDS,
  FORWARDER_STATUS_OPTIONS,
  type CapabilityKey,
  type ForwarderAssessment,
  type ForwarderStatus,
} from "@/lib/forwarder/forwarder-fields";
import {
  ForwarderAssessmentBadge,
  ForwarderStatusBadge,
} from "./forwarder-status-badge";
import { DeleteForwarderDialog } from "./delete-forwarder-dialog";

export type ForwarderRow = {
  id: string;
  company_name: string;
  contact_person: string | null;
  status: ForwarderStatus;
  assessment: ForwarderAssessment | null;
  updatedRelative: string;
} & Record<CapabilityKey, boolean>;

type ColumnKey = "company" | "capabilities" | "contact" | "status" | "assessment" | "updated";

const COLUMN_DEFS: { key: ColumnKey; label: string }[] = [
  { key: "company", label: "Company" },
  { key: "capabilities", label: "Capabilities" },
  { key: "contact", label: "Contact" },
  { key: "status", label: "Status" },
  { key: "assessment", label: "Assessment" },
  { key: "updated", label: "Updated" },
];

const ACTIVE_FILTER_CLASS =
  "border-[#44B048] bg-[#44B048]/10 text-[#192E5B] hover:bg-[#44B048]/15";
const headClass = "px-4 py-3 text-xs font-medium uppercase tracking-wide text-neutral-muted";

function SelectClearAllRow({
  onSelectAll,
  onClearAll,
}: {
  onSelectAll: () => void;
  onClearAll: () => void;
}) {
  return (
    <>
      <div className="flex items-center gap-1.5 px-1.5 py-1 text-xs text-neutral-muted">
        <button type="button" className="hover:text-move-navy hover:underline" onClick={onSelectAll}>
          Select All
        </button>
        <span>·</span>
        <button type="button" className="hover:text-move-navy hover:underline" onClick={onClearAll}>
          Clear All
        </button>
      </div>
      <DropdownMenuSeparator />
    </>
  );
}

function toggleSetValue<T>(set: Set<T>, value: T, checked: boolean): Set<T> {
  const next = new Set(set);
  if (checked) next.add(value);
  else next.delete(value);
  return next;
}

function ForwarderRowMenu({
  projectId,
  forwarder,
  canWrite,
}: {
  projectId: string;
  forwarder: ForwarderRow;
  canWrite: boolean;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);

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
            render={<Link href={`/forwarder-sourcing/${projectId}/forwarders/${forwarder.id}`} />}
          >
            View
          </DropdownMenuItem>
          {canWrite && (
            <>
              <DropdownMenuItem
                render={
                  <Link href={`/forwarder-sourcing/${projectId}/forwarders/${forwarder.id}/edit`} />
                }
              >
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onClick={() => setConfirmOpen(true)}
              >
                Delete
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <DeleteForwarderDialog
        projectId={projectId}
        forwarderId={forwarder.id}
        companyName={forwarder.company_name}
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
      />
    </>
  );
}

export function ForwardersTable({
  projectId,
  forwarders,
  canWrite,
}: {
  projectId: string;
  forwarders: ForwarderRow[];
  canWrite: boolean;
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<Set<ForwarderStatus>>(new Set());
  const [capabilityFilter, setCapabilityFilter] = useState<Set<CapabilityKey>>(new Set());
  const [visibleColumns, setVisibleColumns] = useState<Record<ColumnKey, boolean>>({
    company: true,
    capabilities: true,
    contact: true,
    status: true,
    assessment: true,
    updated: true,
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return forwarders.filter((forwarder) => {
      if (
        q &&
        !forwarder.company_name.toLowerCase().includes(q) &&
        !forwarder.contact_person?.toLowerCase().includes(q)
      ) {
        return false;
      }
      if (statusFilter.size > 0 && !statusFilter.has(forwarder.status)) {
        return false;
      }
      if (
        capabilityFilter.size > 0 &&
        !Array.from(capabilityFilter).every((key) => forwarder[key])
      ) {
        return false;
      }
      return true;
    });
  }, [forwarders, search, statusFilter, capabilityFilter]);

  if (forwarders.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        {canWrite && (
          <div className="flex justify-end">
            <Button nativeButton={false} render={<Link href={`/forwarder-sourcing/${projectId}/forwarders/new`} />}>
              Add Forwarder
            </Button>
          </div>
        )}
        <p className="py-6 text-center text-sm text-neutral-muted">
          No forwarders yet. Adding forwarders is the first step to comparing quotes.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          type="text"
          aria-label="Search"
          placeholder="Search by company or contact"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-64 rounded-xl border-neutral-border"
        />

        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button type="button" variant="outline" className={statusFilter.size > 0 ? ACTIVE_FILTER_CLASS : undefined} />}
          >
            <Filter className="size-3.5" />
            Status{statusFilter.size > 0 ? ` (${statusFilter.size})` : ""}
            <ChevronDown className="size-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-96 overflow-y-auto">
            <SelectClearAllRow
              onSelectAll={() => setStatusFilter(new Set(FORWARDER_STATUS_OPTIONS))}
              onClearAll={() => setStatusFilter(new Set())}
            />
            {FORWARDER_STATUS_OPTIONS.map((status) => (
              <DropdownMenuCheckboxItem
                key={status}
                checked={statusFilter.has(status)}
                onCheckedChange={(checked) => setStatusFilter((prev) => toggleSetValue(prev, status, checked === true))}
                onSelect={(e) => e.preventDefault()}
              >
                {status}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button type="button" variant="outline" className={capabilityFilter.size > 0 ? ACTIVE_FILTER_CLASS : undefined} />}
          >
            <Filter className="size-3.5" />
            Capability{capabilityFilter.size > 0 ? ` (${capabilityFilter.size})` : ""}
            <ChevronDown className="size-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-96 overflow-y-auto">
            <SelectClearAllRow
              onSelectAll={() => setCapabilityFilter(new Set(CAPABILITY_FIELDS.map((c) => c.name)))}
              onClearAll={() => setCapabilityFilter(new Set())}
            />
            {CAPABILITY_FIELDS.map((capability) => (
              <DropdownMenuCheckboxItem
                key={capability.name}
                checked={capabilityFilter.has(capability.name)}
                onCheckedChange={(checked) =>
                  setCapabilityFilter((prev) => toggleSetValue(prev, capability.name, checked === true))
                }
                onSelect={(e) => e.preventDefault()}
              >
                {capability.label}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger render={<Button type="button" variant="outline" />}>
            Columns
            <ChevronDown className="size-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {COLUMN_DEFS.map((column) => (
              <DropdownMenuCheckboxItem
                key={column.key}
                checked={visibleColumns[column.key]}
                onCheckedChange={(checked) =>
                  setVisibleColumns((prev) => ({ ...prev, [column.key]: checked === true }))
                }
                onSelect={(e) => e.preventDefault()}
              >
                {column.label}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {canWrite && (
          <Button
            className="ml-auto"
            nativeButton={false}
            render={<Link href={`/forwarder-sourcing/${projectId}/forwarders/new`} />}
          >
            Add Forwarder
          </Button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-neutral-border bg-white p-6 shadow-sm">
          <p className="py-8 text-center text-sm text-neutral-muted">
            No forwarders match these filters.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-neutral-border bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-neutral-border">
                {visibleColumns.company && <th className={headClass}>Company</th>}
                {visibleColumns.capabilities && <th className={headClass}>Capabilities</th>}
                {visibleColumns.contact && <th className={headClass}>Contact</th>}
                {visibleColumns.status && <th className={headClass}>Status</th>}
                {visibleColumns.assessment && <th className={headClass}>Assessment</th>}
                {visibleColumns.updated && <th className={headClass}>Updated</th>}
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((forwarder) => {
                const confirmedChips = CAPABILITY_FIELDS.filter((c) => forwarder[c.name]).slice(0, 3);
                const confirmedTotal = CAPABILITY_FIELDS.filter((c) => forwarder[c.name]).length;
                return (
                  <tr key={forwarder.id} className="border-b border-neutral-border last:border-b-0 hover:bg-neutral-bg">
                    {visibleColumns.company && (
                      <td className="px-0 py-0">
                        <Link
                          href={`/forwarder-sourcing/${projectId}/forwarders/${forwarder.id}`}
                          className="block px-4 py-3 text-move-navy"
                        >
                          {forwarder.company_name}
                        </Link>
                      </td>
                    )}
                    {visibleColumns.capabilities && (
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {confirmedChips.length === 0 ? (
                            <span className="text-neutral-muted">—</span>
                          ) : (
                            <>
                              {confirmedChips.map((c) => (
                                <Badge key={c.name} variant="outline" className="border-neutral-border text-neutral-muted">
                                  {c.label}
                                </Badge>
                              ))}
                              {confirmedTotal > confirmedChips.length && (
                                <Badge variant="outline" className="border-neutral-border text-neutral-muted">
                                  +{confirmedTotal - confirmedChips.length}
                                </Badge>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    )}
                    {visibleColumns.contact && (
                      <td className="px-4 py-3 text-neutral-muted">{forwarder.contact_person || "—"}</td>
                    )}
                    {visibleColumns.status && (
                      <td className="px-4 py-3">
                        <ForwarderStatusBadge status={forwarder.status} />
                      </td>
                    )}
                    {visibleColumns.assessment && (
                      <td className="px-4 py-3">
                        {forwarder.assessment ? (
                          <ForwarderAssessmentBadge assessment={forwarder.assessment} />
                        ) : (
                          <span className="text-neutral-muted">—</span>
                        )}
                      </td>
                    )}
                    {visibleColumns.updated && (
                      <td className="px-4 py-3 text-neutral-muted">{forwarder.updatedRelative}</td>
                    )}
                    <td className="px-4 py-3">
                      <ForwarderRowMenu projectId={projectId} forwarder={forwarder} canWrite={canWrite} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

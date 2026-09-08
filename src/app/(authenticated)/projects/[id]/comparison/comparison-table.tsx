"use client";

import { useMemo, useState } from "react";
import { Filter, ChevronDown } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge, type ProviderStatus } from "../providers/status-badge";

const STATUS_OPTIONS: ProviderStatus[] = [
  "Potential / Not Contacted",
  "Baseline",
  "Contacted",
  "Client Requirements Sent",
  "Scheduled for Discovery Call",
  "Waiting for Quotation",
  "Reviewing Quotation",
  "Clarifications",
  "Negotiation",
  "Shortlisted",
  "Vetted",
  "Unfit",
  "Do not Contact",
  "Withdrawn / No Response",
  "Completed / Closed",
];

const CAPABILITY_FILTERS: { key: CapabilityKey; label: string }[] = [
  { key: "receiving", label: "Receiving" },
  { key: "storage", label: "Storage" },
  { key: "fulfillment", label: "Fulfillment (Pick, Check, Pack)" },
  { key: "dispatch", label: "Dispatch" },
  { key: "adhoc_kitting_bundling", label: "Adhoc Kitting / Bundling" },
  { key: "adhoc_labelling", label: "Adhoc Labelling" },
  { key: "returns", label: "Returns" },
  { key: "annual_inventory_count", label: "Annual Inventory Count" },
  { key: "cycle_count", label: "Cycle Count" },
  { key: "inventory_count_on_request", label: "Inventory Count on Request" },
  { key: "one_time_system_setup", label: "One-Time System Setup" },
  { key: "lot_batch_expiry_tracking", label: "Lot/Batch Expiry Tracking" },
  {
    key: "temp_controlled_storage",
    label: "Temperature-Controlled Storage",
  },
  { key: "retail_edi_compliance", label: "Retail/EDI Compliance" },
  { key: "cross_docking", label: "Cross Docking" },
];

type CapabilityKey =
  | "receiving"
  | "storage"
  | "fulfillment"
  | "dispatch"
  | "adhoc_kitting_bundling"
  | "adhoc_labelling"
  | "returns"
  | "annual_inventory_count"
  | "cycle_count"
  | "inventory_count_on_request"
  | "one_time_system_setup"
  | "lot_batch_expiry_tracking"
  | "temp_controlled_storage"
  | "retail_edi_compliance"
  | "cross_docking";

const ACTIVE_FILTER_CLASS =
  "border-[#44B048] bg-[#44B048]/10 text-[#192E5B] hover:bg-[#44B048]/15";

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
        <button
          type="button"
          className="hover:text-move-navy hover:underline"
          onClick={onSelectAll}
        >
          Select All
        </button>
        <span>·</span>
        <button
          type="button"
          className="hover:text-move-navy hover:underline"
          onClick={onClearAll}
        >
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

export type ComparisonRow = {
  id: string;
  company_name: string;
  location: string | null;
  status: ProviderStatus;
  is_incumbent: boolean;
  b2b: boolean;
  b2c: boolean;
  receiving: boolean;
  storage: boolean;
  fulfillment: boolean;
  dispatch: boolean;
  adhoc_kitting_bundling: boolean;
  adhoc_labelling: boolean;
  returns: boolean;
  annual_inventory_count: boolean;
  cycle_count: boolean;
  inventory_count_on_request: boolean;
  one_time_system_setup: boolean;
  lot_batch_expiry_tracking: boolean;
  temp_controlled_storage: boolean;
  retail_edi_compliance: boolean;
  cross_docking: boolean;
  storage_cost: number | null;
  pick_pack_cost: number | null;
  receiving_cost: number | null;
  returns_cost: number | null;
  has_cost_data: boolean;
  total_cost: number | null;
  cost_rank: number | null;
  savingsState: "baseline" | "value" | "pending" | "na" | "no-data";
  savings_vs_baseline: number | null;
  savings_pct: number | null;
  cost_position: string;
};

const USD_FORMATTER = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

function formatSavings(row: ComparisonRow) {
  switch (row.savingsState) {
    case "baseline":
      return "—";
    case "value":
      return row.savings_vs_baseline != null
        ? USD_FORMATTER.format(row.savings_vs_baseline)
        : "—";
    case "pending":
      return "Pending";
    case "na":
      return "N/A";
    case "no-data":
      return "Not enough data";
  }
}

function formatSavingsPct(row: ComparisonRow) {
  switch (row.savingsState) {
    case "baseline":
      return "—";
    case "value":
      return row.savings_pct != null ? `${row.savings_pct.toFixed(1)}%` : "—";
    case "pending":
      return "Pending";
    case "na":
      return "N/A";
    case "no-data":
      return "Not enough data";
  }
}

export function ComparisonTable({ rows }: { rows: ComparisonRow[] }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<Set<ProviderStatus>>(
    new Set(),
  );
  const [capabilityFilter, setCapabilityFilter] = useState<
    Set<CapabilityKey>
  >(new Set());
  const [businessModel, setBusinessModel] = useState<"all" | "b2b" | "b2c">(
    "all",
  );

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (
        search.trim() &&
        !row.company_name.toLowerCase().includes(search.trim().toLowerCase())
      ) {
        return false;
      }
      if (statusFilter.size > 0 && !statusFilter.has(row.status)) {
        return false;
      }
      if (
        capabilityFilter.size > 0 &&
        !Array.from(capabilityFilter).every((key) => row[key])
      ) {
        return false;
      }
      if (businessModel === "b2b" && !row.b2b) return false;
      if (businessModel === "b2c" && !row.b2c) return false;
      return true;
    });
  }, [rows, search, statusFilter, capabilityFilter, businessModel]);

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-neutral-border bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <Input
            id="search"
            type="text"
            aria-label="Search Company"
            placeholder="e.g. Acme Logistics"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-64 rounded-xl border-neutral-border"
          />

          <Select
            value={businessModel}
            onValueChange={(value) =>
              setBusinessModel(value as "all" | "b2b" | "b2c")
            }
          >
            <SelectTrigger className="w-40 rounded-xl border-neutral-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Business Models</SelectItem>
              <SelectItem value="b2b">B2B</SelectItem>
              <SelectItem value="b2c">B2C</SelectItem>
            </SelectContent>
          </Select>

          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  variant="outline"
                  className={statusFilter.size > 0 ? ACTIVE_FILTER_CLASS : undefined}
                />
              }
            >
              <Filter className="size-3.5" />
              Status{statusFilter.size > 0 ? ` (${statusFilter.size})` : ""}
              <ChevronDown className="size-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-96 overflow-y-auto">
              <SelectClearAllRow
                onSelectAll={() => setStatusFilter(new Set(STATUS_OPTIONS))}
                onClearAll={() => setStatusFilter(new Set())}
              />
              {STATUS_OPTIONS.map((status) => (
                <DropdownMenuCheckboxItem
                  key={status}
                  checked={statusFilter.has(status)}
                  onCheckedChange={(checked) =>
                    setStatusFilter((prev) =>
                      toggleSetValue(prev, status, checked === true),
                    )
                  }
                  onSelect={(e) => e.preventDefault()}
                >
                  {status}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  variant="outline"
                  className={
                    capabilityFilter.size > 0 ? ACTIVE_FILTER_CLASS : undefined
                  }
                />
              }
            >
              <Filter className="size-3.5" />
              Capabilities
              {capabilityFilter.size > 0 ? ` (${capabilityFilter.size})` : ""}
              <ChevronDown className="size-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-96 overflow-y-auto">
              <SelectClearAllRow
                onSelectAll={() =>
                  setCapabilityFilter(
                    new Set(CAPABILITY_FILTERS.map((c) => c.key)),
                  )
                }
                onClearAll={() => setCapabilityFilter(new Set())}
              />
              {CAPABILITY_FILTERS.map((capability) => (
                <DropdownMenuCheckboxItem
                  key={capability.key}
                  checked={capabilityFilter.has(capability.key)}
                  onCheckedChange={(checked) =>
                    setCapabilityFilter((prev) =>
                      toggleSetValue(prev, capability.key, checked === true),
                    )
                  }
                  onSelect={(e) => e.preventDefault()}
                >
                  {capability.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {filteredRows.length === 0 ? (
        <div className="rounded-2xl border border-neutral-border bg-white p-6 shadow-sm">
          <p className="py-8 text-center text-sm text-neutral-muted">
            No providers match these filters.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-neutral-border bg-white shadow-sm">
          <Table>
            <TableHeader>
              <TableRow className="border-neutral-border">
                <TableHead className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-neutral-muted">
                  Company
                </TableHead>
                <TableHead className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-neutral-muted">
                  Location
                </TableHead>
                <TableHead className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-neutral-muted">
                  Status
                </TableHead>
                <TableHead className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-neutral-muted">
                  Storage Cost
                </TableHead>
                <TableHead className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-neutral-muted">
                  Pick & Pack Cost
                </TableHead>
                <TableHead className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-neutral-muted">
                  Receiving Cost
                </TableHead>
                <TableHead className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-neutral-muted">
                  Returns Cost
                </TableHead>
                <TableHead className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-neutral-muted">
                  Total Cost
                </TableHead>
                <TableHead className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-neutral-muted">
                  Cost Rank
                </TableHead>
                <TableHead className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-neutral-muted">
                  Savings vs Baseline
                </TableHead>
                <TableHead className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-neutral-muted">
                  Savings %
                </TableHead>
                <TableHead className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-neutral-muted">
                  Cost Position
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRows.map((row) => (
                <TableRow
                  key={row.id}
                  className="border-neutral-border hover:bg-neutral-bg"
                >
                  <TableCell className="px-4 py-3 whitespace-normal text-move-navy">
                    <div className="flex items-center gap-2">
                      {row.company_name}
                      {row.is_incumbent && (
                        <Badge
                          variant="outline"
                          className="border-transparent bg-[#E3F2FD] text-[#1565C0]"
                        >
                          Incumbent
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="px-4 py-3 whitespace-normal text-neutral-muted">
                    {row.location || "—"}
                  </TableCell>
                  <TableCell className="px-4 py-3 whitespace-normal">
                    <StatusBadge status={row.status} />
                  </TableCell>
                  <TableCell className="px-4 py-3 whitespace-normal text-move-navy">
                    {row.storage_cost != null
                      ? USD_FORMATTER.format(row.storage_cost)
                      : "—"}
                  </TableCell>
                  <TableCell className="px-4 py-3 whitespace-normal text-move-navy">
                    {row.pick_pack_cost != null
                      ? USD_FORMATTER.format(row.pick_pack_cost)
                      : "—"}
                  </TableCell>
                  <TableCell className="px-4 py-3 whitespace-normal text-move-navy">
                    {row.receiving_cost != null
                      ? USD_FORMATTER.format(row.receiving_cost)
                      : "—"}
                  </TableCell>
                  <TableCell className="px-4 py-3 whitespace-normal text-move-navy">
                    {row.returns_cost != null
                      ? USD_FORMATTER.format(row.returns_cost)
                      : "—"}
                  </TableCell>
                  <TableCell className="px-4 py-3 whitespace-normal text-move-navy">
                    {row.has_cost_data && row.total_cost != null
                      ? USD_FORMATTER.format(row.total_cost)
                      : "—"}
                  </TableCell>
                  <TableCell className="px-4 py-3 whitespace-normal text-neutral-muted">
                    {row.cost_rank ?? "Not enough data to rank"}
                  </TableCell>
                  <TableCell className="px-4 py-3 whitespace-normal text-neutral-muted">
                    {formatSavings(row)}
                  </TableCell>
                  <TableCell className="px-4 py-3 whitespace-normal text-neutral-muted">
                    {formatSavingsPct(row)}
                  </TableCell>
                  <TableCell className="px-4 py-3 whitespace-normal text-neutral-muted">
                    {row.cost_position}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

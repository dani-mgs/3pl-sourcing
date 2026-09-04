"use client";

import { useMemo, useState } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge, type ProviderStatus } from "../providers/status-badge";

const STATUS_OPTIONS: ProviderStatus[] = [
  "Potential",
  "Contacted",
  "Discovery Call",
  "Quotation Received",
  "Negotiation",
  "Vetted",
  "Rejected",
];

const CAPABILITY_FILTERS: { key: CapabilityKey; label: string }[] = [
  { key: "fulfillment", label: "Fulfillment" },
  { key: "storage", label: "Storage" },
  { key: "cross_docking", label: "Cross Docking" },
  { key: "temp_controlled_storage", label: "Temp-Controlled Storage" },
];

type CapabilityKey =
  | "fulfillment"
  | "storage"
  | "cross_docking"
  | "temp_controlled_storage";

export type ComparisonRow = {
  id: string;
  company_name: string;
  location: string | null;
  status: ProviderStatus;
  is_incumbent: boolean;
  b2b: boolean;
  b2c: boolean;
  fulfillment: boolean;
  storage: boolean;
  cross_docking: boolean;
  temp_controlled_storage: boolean;
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
    Record<CapabilityKey, boolean>
  >({
    fulfillment: false,
    storage: false,
    cross_docking: false,
    temp_controlled_storage: false,
  });
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
      for (const capability of CAPABILITY_FILTERS) {
        if (capabilityFilter[capability.key] && !row[capability.key]) {
          return false;
        }
      }
      if (businessModel === "b2b" && !row.b2b) return false;
      if (businessModel === "b2c" && !row.b2c) return false;
      return true;
    });
  }, [rows, search, statusFilter, capabilityFilter, businessModel]);

  function toggleStatus(status: ProviderStatus, checked: boolean) {
    setStatusFilter((prev) => {
      const next = new Set(prev);
      if (checked) next.add(status);
      else next.delete(status);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-neutral-border bg-white p-6 shadow-sm">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="search" className="text-sm font-medium text-move-navy">
              Search Company
            </label>
            <Input
              id="search"
              type="text"
              placeholder="e.g. Acme Logistics"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="rounded-xl border-neutral-border"
            />
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-move-navy">
              Business Model
            </span>
            <Select
              value={businessModel}
              onValueChange={(value) =>
                setBusinessModel(value as "all" | "b2b" | "b2c")
              }
            >
              <SelectTrigger className="w-full rounded-xl border-neutral-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="b2b">B2B</SelectItem>
                <SelectItem value="b2c">B2C</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-move-navy">Status</span>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
              {STATUS_OPTIONS.map((status) => (
                <label
                  key={status}
                  className="flex items-center gap-2 text-xs text-move-navy"
                >
                  <Checkbox
                    checked={statusFilter.has(status)}
                    onCheckedChange={(checked) =>
                      toggleStatus(status, checked === true)
                    }
                  />
                  {status}
                </label>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-move-navy">
              Capabilities
            </span>
            <div className="flex flex-col gap-1.5">
              {CAPABILITY_FILTERS.map((capability) => (
                <label
                  key={capability.key}
                  className="flex items-center gap-2 text-xs text-move-navy"
                >
                  <Checkbox
                    checked={capabilityFilter[capability.key]}
                    onCheckedChange={(checked) =>
                      setCapabilityFilter((prev) => ({
                        ...prev,
                        [capability.key]: checked === true,
                      }))
                    }
                  />
                  {capability.label}
                </label>
              ))}
            </div>
          </div>
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

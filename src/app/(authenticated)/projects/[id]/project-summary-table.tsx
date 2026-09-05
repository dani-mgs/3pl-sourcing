"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  StatusBadge,
  AssessmentBadge,
  type ProviderStatus,
  type AssessmentStatus,
} from "./providers/status-badge";
import {
  STATUS_OPTIONS,
  ASSESSMENT_OPTIONS,
} from "./providers/provider-form";
import { ProviderRowMenu } from "./provider-row-menu";

type ServiceKey =
  | "receiving"
  | "storage"
  | "fulfillment"
  | "dispatch"
  | "adhoc_kitting_bundling"
  | "adhoc_labelling"
  | "returns"
  | "lot_batch_expiry_tracking"
  | "temp_controlled_storage";

const SERVICE_FIELDS: { key: ServiceKey; label: string; chipLabel: string }[] = [
  { key: "receiving", label: "Receiving", chipLabel: "Receiving" },
  { key: "storage", label: "Storage", chipLabel: "Storage" },
  {
    key: "fulfillment",
    label: "Fulfillment (Pick, Check, Pack)",
    chipLabel: "Fulfillment",
  },
  { key: "dispatch", label: "Dispatch", chipLabel: "Dispatch" },
  {
    key: "adhoc_kitting_bundling",
    label: "Adhoc Kitting / Bundling",
    chipLabel: "Adhoc Kitting / Bundling",
  },
  {
    key: "adhoc_labelling",
    label: "Adhoc Labelling",
    chipLabel: "Adhoc Labelling",
  },
  { key: "returns", label: "Returns", chipLabel: "Returns" },
  {
    key: "lot_batch_expiry_tracking",
    label: "Lot / Batch / Expiry Tracking",
    chipLabel: "Lot/Batch/Expiry",
  },
  {
    key: "temp_controlled_storage",
    label: "Temperature-Controlled Storage",
    chipLabel: "Temp-Controlled",
  },
];

type ColumnKey =
  | "company"
  | "location"
  | "services"
  | "onboarding"
  | "contact"
  | "status"
  | "assessment";

const COLUMN_DEFS: { key: ColumnKey; label: string }[] = [
  { key: "company", label: "Company" },
  { key: "location", label: "Location" },
  { key: "services", label: "Services" },
  { key: "onboarding", label: "Onboarding Period" },
  { key: "contact", label: "Contact" },
  { key: "status", label: "Status" },
  { key: "assessment", label: "Assessment" },
];

export type ProviderRow = {
  id: string;
  company_name: string;
  location: string | null;
  status: ProviderStatus;
  assessment_status: AssessmentStatus | null;
  is_incumbent: boolean;
  onboarding_period_months: number | null;
  contact_person: string | null;
  receiving: boolean;
  storage: boolean;
  fulfillment: boolean;
  dispatch: boolean;
  adhoc_kitting_bundling: boolean;
  adhoc_labelling: boolean;
  returns: boolean;
  lot_batch_expiry_tracking: boolean;
  temp_controlled_storage: boolean;
};

export function ProjectSummaryTable({
  projectId,
  providers,
  canWrite,
}: {
  projectId: string;
  providers: ProviderRow[];
  canWrite: boolean;
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<Set<ProviderStatus>>(
    new Set(),
  );
  const [serviceFilter, setServiceFilter] = useState<Set<ServiceKey>>(
    new Set(),
  );
  const [assessmentFilter, setAssessmentFilter] = useState<
    Set<AssessmentStatus>
  >(new Set());
  const [visibleColumns, setVisibleColumns] = useState<
    Record<ColumnKey, boolean>
  >({
    company: true,
    location: true,
    services: true,
    onboarding: true,
    contact: true,
    status: true,
    assessment: true,
  });

  function toggleSetValue<T>(set: Set<T>, value: T, checked: boolean): Set<T> {
    const next = new Set(set);
    if (checked) next.add(value);
    else next.delete(value);
    return next;
  }

  const filteredProviders = useMemo(() => {
    return providers.filter((provider) => {
      if (
        search.trim() &&
        !provider.company_name
          .toLowerCase()
          .includes(search.trim().toLowerCase())
      ) {
        return false;
      }
      if (statusFilter.size > 0 && !statusFilter.has(provider.status)) {
        return false;
      }
      if (
        serviceFilter.size > 0 &&
        !Array.from(serviceFilter).every((key) => provider[key])
      ) {
        return false;
      }
      if (
        assessmentFilter.size > 0 &&
        (!provider.assessment_status ||
          !assessmentFilter.has(provider.assessment_status))
      ) {
        return false;
      }
      return true;
    });
  }, [providers, search, statusFilter, serviceFilter, assessmentFilter]);

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-neutral-border bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <Input
            type="text"
            aria-label="Search"
            placeholder="Search by company name"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-64 rounded-xl border-neutral-border"
          />

          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button type="button" variant="outline" />}
            >
              Status{statusFilter.size > 0 ? ` (${statusFilter.size})` : ""}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-80 overflow-y-auto">
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
              render={<Button type="button" variant="outline" />}
            >
              Service{serviceFilter.size > 0 ? ` (${serviceFilter.size})` : ""}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-80 overflow-y-auto">
              {SERVICE_FIELDS.map((service) => (
                <DropdownMenuCheckboxItem
                  key={service.key}
                  checked={serviceFilter.has(service.key)}
                  onCheckedChange={(checked) =>
                    setServiceFilter((prev) =>
                      toggleSetValue(prev, service.key, checked === true),
                    )
                  }
                  onSelect={(e) => e.preventDefault()}
                >
                  {service.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button type="button" variant="outline" />}
            >
              Assessment
              {assessmentFilter.size > 0 ? ` (${assessmentFilter.size})` : ""}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-80 overflow-y-auto">
              {ASSESSMENT_OPTIONS.map((assessment) => (
                <DropdownMenuCheckboxItem
                  key={assessment}
                  checked={assessmentFilter.has(assessment)}
                  onCheckedChange={(checked) =>
                    setAssessmentFilter((prev) =>
                      toggleSetValue(prev, assessment, checked === true),
                    )
                  }
                  onSelect={(e) => e.preventDefault()}
                >
                  {assessment}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button type="button" variant="outline" />}
            >
              Columns
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {COLUMN_DEFS.map((column) => (
                <DropdownMenuCheckboxItem
                  key={column.key}
                  checked={visibleColumns[column.key]}
                  onCheckedChange={(checked) =>
                    setVisibleColumns((prev) => ({
                      ...prev,
                      [column.key]: checked === true,
                    }))
                  }
                  onSelect={(e) => e.preventDefault()}
                >
                  {column.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {filteredProviders.length === 0 ? (
        <div className="rounded-2xl border border-neutral-border bg-white p-6 shadow-sm">
          <p className="py-8 text-center text-sm text-neutral-muted">
            No providers match these filters.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-neutral-border bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-neutral-border">
                {visibleColumns.company && (
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-neutral-muted">
                    Company
                  </th>
                )}
                {visibleColumns.location && (
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-neutral-muted">
                    Location
                  </th>
                )}
                {visibleColumns.services && (
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-neutral-muted">
                    Services
                  </th>
                )}
                {visibleColumns.onboarding && (
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-neutral-muted">
                    Onboarding Period
                  </th>
                )}
                {visibleColumns.contact && (
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-neutral-muted">
                    Contact
                  </th>
                )}
                {visibleColumns.status && (
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-neutral-muted">
                    Status
                  </th>
                )}
                {visibleColumns.assessment && (
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-neutral-muted">
                    Assessment
                  </th>
                )}
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filteredProviders.map((provider) => {
                const serviceChips = SERVICE_FIELDS.filter(
                  (service) => provider[service.key],
                ).slice(0, 3);

                return (
                  <tr
                    key={provider.id}
                    className="border-b border-neutral-border last:border-b-0 hover:bg-neutral-bg"
                  >
                    {visibleColumns.company && (
                      <td className="px-0 py-0">
                        <Link
                          href={`/projects/${projectId}/providers/${provider.id}`}
                          className="flex items-center gap-2 px-4 py-3 text-move-navy"
                        >
                          {provider.company_name}
                          {provider.is_incumbent && (
                            <Badge
                              variant="outline"
                              className="border-transparent bg-[#E3F2FD] text-[#1565C0]"
                            >
                              Incumbent
                            </Badge>
                          )}
                        </Link>
                      </td>
                    )}
                    {visibleColumns.location && (
                      <td className="px-4 py-3 text-neutral-muted">
                        {provider.location || "—"}
                      </td>
                    )}
                    {visibleColumns.services && (
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {serviceChips.length === 0 ? (
                            <span className="text-neutral-muted">—</span>
                          ) : (
                            serviceChips.map((service) => (
                              <Badge
                                key={service.key}
                                variant="outline"
                                className="border-neutral-border text-neutral-muted"
                              >
                                {service.chipLabel}
                              </Badge>
                            ))
                          )}
                        </div>
                      </td>
                    )}
                    {visibleColumns.onboarding && (
                      <td className="px-4 py-3 text-neutral-muted">
                        {provider.onboarding_period_months
                          ? `${provider.onboarding_period_months} months`
                          : "—"}
                      </td>
                    )}
                    {visibleColumns.contact && (
                      <td className="px-4 py-3 text-neutral-muted">
                        {provider.contact_person || "—"}
                      </td>
                    )}
                    {visibleColumns.status && (
                      <td className="px-4 py-3">
                        <StatusBadge status={provider.status} />
                      </td>
                    )}
                    {visibleColumns.assessment && (
                      <td className="px-4 py-3">
                        {provider.assessment_status ? (
                          <AssessmentBadge
                            status={provider.assessment_status}
                          />
                        ) : (
                          <span className="text-neutral-muted">—</span>
                        )}
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <ProviderRowMenu
                        projectId={projectId}
                        providerId={provider.id}
                        companyName={provider.company_name}
                        canWrite={canWrite}
                      />
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

"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  StatusBadge,
  type ProviderStatus,
} from "../../../../projects/[id]/providers/status-badge";
import { STATUS_OPTIONS } from "../../../../projects/[id]/providers/provider-form";
import {
  quickAddProvider,
  removeQuickAddedProvider,
} from "./actions";

const fieldClass =
  "rounded-xl border border-neutral-border px-3 py-2 text-sm text-move-navy placeholder:italic placeholder:text-gray-400 focus:border-move-green focus:outline-none focus:ring-2 focus:ring-move-green";
const labelClass = "text-sm font-medium text-move-navy";

const DEFAULT_STATUS: ProviderStatus = "Potential / Not Contacted";

type QuickAddedProvider = {
  id: string;
  company_name: string;
  location: string | null;
  contact_person: string | null;
  status: string;
};

export function QuickAddProviders({
  clientRequirementId,
  initialProviders,
  backHref,
  reviewHref,
}: {
  clientRequirementId: string;
  initialProviders: QuickAddedProvider[];
  backHref: string;
  reviewHref: string;
}) {
  const [providers, setProviders] = useState(initialProviders);
  const [status, setStatus] = useState<ProviderStatus>(DEFAULT_STATUS);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  function handleAddAnother(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await quickAddProvider(clientRequirementId, formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.provider) {
        setProviders((prev) => [...prev, result.provider!]);
      }
      formRef.current?.reset();
      setStatus(DEFAULT_STATUS);
    });
  }

  function handleRemove(providerId: string) {
    startTransition(async () => {
      const result = await removeQuickAddedProvider(
        clientRequirementId,
        providerId,
      );
      if (result.error) {
        setError(result.error);
        return;
      }
      setProviders((prev) => prev.filter((p) => p.id !== providerId));
    });
  }

  function handleNavigateForward(href: string) {
    const companyName = (
      formRef.current?.elements.namedItem("company_name") as HTMLInputElement
    )?.value;

    if (!companyName?.trim()) {
      router.push(href);
      return;
    }

    setError(null);
    startTransition(async () => {
      const formData = new FormData(formRef.current!);
      const result = await quickAddProvider(clientRequirementId, formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.provider) {
        setProviders((prev) => [...prev, result.provider!]);
      }
      formRef.current?.reset();
      setStatus(DEFAULT_STATUS);
      router.push(href);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-2xl border border-neutral-border bg-white p-6 shadow-sm">
        <form
          ref={formRef}
          action={handleAddAnother}
          className="flex flex-col gap-4"
        >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label htmlFor="company_name" className={labelClass}>
              Company Name
            </label>
            <input
              id="company_name"
              name="company_name"
              type="text"
              required
              placeholder="e.g. Acme Logistics"
              className={fieldClass}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="location" className={labelClass}>
              Location
            </label>
            <input
              id="location"
              name="location"
              type="text"
              placeholder="e.g. Los Angeles, USA"
              className={fieldClass}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="contact_person" className={labelClass}>
              Contact Person
            </label>
            <input
              id="contact_person"
              name="contact_person"
              type="text"
              placeholder="e.g. Jane Smith"
              className={fieldClass}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="status" className={labelClass}>
              Status
            </label>
            <Select
              name="status"
              value={status}
              onValueChange={(value) => setStatus(value as ProviderStatus)}
            >
              <SelectTrigger
                id="status"
                className="w-full rounded-xl border-neutral-border"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

          <Button
            type="submit"
            variant="outline"
            disabled={isPending}
            className="self-start px-4 py-2.5"
          >
            {isPending ? "Adding..." : "Add Another"}
          </Button>
        </form>
      </div>

      {providers.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-neutral-border bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-neutral-border">
                <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-neutral-muted">
                  Company
                </th>
                <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-neutral-muted">
                  Location
                </th>
                <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-neutral-muted">
                  Status
                </th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {providers.map((provider) => (
                <tr
                  key={provider.id}
                  className="border-b border-neutral-border last:border-b-0"
                >
                  <td className="px-4 py-3 text-move-navy">
                    {provider.company_name}
                  </td>
                  <td className="px-4 py-3 text-neutral-muted">
                    {provider.location || "—"}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={provider.status as ProviderStatus} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => handleRemove(provider.id)}
                      disabled={isPending}
                      className="text-sm text-danger hover:underline"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <Button
          type="button"
          variant="outline"
          disabled={isPending}
          onClick={() => router.push(backHref)}
          className="px-4 py-2.5"
        >
          ← Back to Client Info
        </Button>

        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            disabled={isPending}
            onClick={() => handleNavigateForward(reviewHref)}
            className="px-4 py-2.5"
          >
            Skip for now →
          </Button>
          <Button
            type="button"
            disabled={isPending}
            onClick={() => handleNavigateForward(reviewHref)}
            className="px-4 py-2.5"
          >
            {isPending ? "Saving..." : "Continue to Verify →"}
          </Button>
        </div>
      </div>
    </div>
  );
}

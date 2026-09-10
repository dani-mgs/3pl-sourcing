"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  BLANK_PROVIDER_DEFAULTS,
  ProviderForm,
  type ProviderFormDefaults,
} from "@/components/provider-form";
import {
  EXISTING_PROVIDER_STORAGE_KEY,
  type ExtractedExistingProvider,
} from "@/lib/existing-provider-prefill";
import {
  StatusBadge,
  type ProviderStatus,
} from "../../../../projects/[id]/providers/status-badge";
import {
  quickAddProvider,
  removeQuickAddedProvider,
} from "./actions";

function providerDefaultsFromExtraction(
  extracted: ExtractedExistingProvider,
): ProviderFormDefaults {
  return {
    ...BLANK_PROVIDER_DEFAULTS,
    company_name: extracted.company_name,
    location: extracted.location,
    storage_cost: extracted.storage_cost,
    pick_pack_cost: extracted.pick_pack_cost,
    receiving_cost: extracted.receiving_cost,
    returns_cost: extracted.returns_cost,
    is_incumbent: true,
  };
}

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
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [formKey, setFormKey] = useState(0);
  const [formDefaults, setFormDefaults] = useState<
    ProviderFormDefaults | undefined
  >(undefined);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  useEffect(() => {
    // sessionStorage only exists client-side, so this has to run post-mount rather
    // than as a lazy useState initializer — that would read a different value during
    // SSR vs. client hydration and cause a mismatch. The one extra client-only render
    // this causes is intentional.
    try {
      const raw = sessionStorage.getItem(EXISTING_PROVIDER_STORAGE_KEY);
      if (!raw) return;
      sessionStorage.removeItem(EXISTING_PROVIDER_STORAGE_KEY);
      const extracted = JSON.parse(raw) as ExtractedExistingProvider;
      if (!extracted.company_name?.trim()) return;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFormDefaults(providerDefaultsFromExtraction(extracted));
      setFormKey((k) => k + 1);
    } catch {
      // malformed or unavailable sessionStorage — form just starts blank
    }
  }, []);

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
      setFormDefaults(undefined);
      setFormKey((k) => k + 1);
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
      router.push(href);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-2xl border border-neutral-border bg-white p-6 shadow-sm">
        <ProviderForm
          key={formKey}
          formRef={formRef}
          formAction={handleAddAnother}
          pending={isPending}
          error={error ?? undefined}
          submitLabel="Add Another"
          pendingLabel="Adding..."
          defaultValues={formDefaults}
        />
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

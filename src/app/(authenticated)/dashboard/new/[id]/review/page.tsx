import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { WizardSteps } from "@/components/wizard-steps";
import {
  StatusBadge,
  type ProviderStatus,
} from "../../../../projects/[id]/providers/status-badge";

const CLIENT_FIELDS: { key: string; label: string }[] = [
  { key: "client_name", label: "Client Name" },
  { key: "business_model", label: "Business Model" },
  { key: "target_geography", label: "Target Geography" },
  { key: "avg_monthly_orders", label: "Average Monthly Orders" },
  { key: "peak_monthly_orders", label: "Peak Monthly Orders" },
  { key: "latest_month_orders", label: "Latest Month Orders" },
  { key: "avg_monthly_units", label: "Average Monthly Units" },
  { key: "peak_monthly_units", label: "Peak Monthly Units" },
  { key: "benchmark_period", label: "Benchmark Period" },
  { key: "core_cost_categories", label: "Core Cost Categories" },
  { key: "key_capability_needs", label: "Services Required" },
  { key: "main_decision_focus", label: "Main Decision Focus" },
  {
    key: "tech_integration_requirement",
    label: "Technology/Integration Requirement",
  },
  {
    key: "special_handling_requirement",
    label: "Special Handling Requirement",
  },
  { key: "fixed_comparison_principle", label: "Fixed Comparison Principle" },
  { key: "important_limitation", label: "Important Limitation" },
  {
    key: "assumptions_data_limitations",
    label: "Assumptions/Data Limitations",
  },
];

export default async function ReviewStepPage({
  params,
}: PageProps<"/dashboard/new/[id]/review">) {
  const { id } = await params;

  const supabase = await createClient();

  const { data: clientRequirement } = await supabase
    .from("client_requirements")
    .select(
      "client_name, business_model, target_geography, avg_monthly_orders, peak_monthly_orders, latest_month_orders, avg_monthly_units, peak_monthly_units, benchmark_period, core_cost_categories, key_capability_needs, main_decision_focus, tech_integration_requirement, special_handling_requirement, fixed_comparison_principle, important_limitation, assumptions_data_limitations",
    )
    .eq("id", id)
    .single();

  if (!clientRequirement) {
    notFound();
  }

  const { data: providers } = await supabase
    .from("three_pl_providers")
    .select("id, company_name, location, status")
    .eq("client_requirement_id", id)
    .order("created_at", { ascending: true });

  const filledFields = CLIENT_FIELDS.filter((field) => {
    const value = clientRequirement[field.key as keyof typeof clientRequirement];
    return value !== null && value !== undefined && value !== "";
  });

  return (
    <div className="max-w-5xl px-8 py-10">
      <h1 className="mb-8 font-display text-2xl font-semibold text-move-navy">
        Verify Details
      </h1>

      <div className="grid grid-cols-1 gap-8 md:grid-cols-[180px_1fr]">
        <WizardSteps currentStep={3} />

        <div className="flex flex-col gap-6">
          <section className="rounded-2xl border border-neutral-border bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold text-move-navy">
                Client Details
              </h2>
              <Link
                href={`/dashboard/new/${id}`}
                className="text-sm font-medium text-move-green hover:underline"
              >
                Edit
              </Link>
            </div>
            {filledFields.length === 0 ? (
              <p className="text-sm text-neutral-muted">
                No details entered yet.
              </p>
            ) : (
              <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {filledFields.map((field) => (
                  <div key={field.key}>
                    <dt className="text-xs text-neutral-muted">
                      {field.label}
                    </dt>
                    <dd className="text-sm text-move-navy">
                      {String(
                        clientRequirement[
                          field.key as keyof typeof clientRequirement
                        ],
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </section>

          <section className="rounded-2xl border border-neutral-border bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold text-move-navy">
                3PLs Added
              </h2>
              <Link
                href={`/dashboard/new/${id}/providers`}
                className="text-sm font-medium text-move-green hover:underline"
              >
                Edit
              </Link>
            </div>
            {!providers || providers.length === 0 ? (
              <p className="text-sm text-neutral-muted">
                No 3PLs added yet.
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {providers.map((provider) => (
                  <li
                    key={provider.id}
                    className="flex items-center justify-between gap-3 border-b border-neutral-border pb-3 last:border-b-0 last:pb-0"
                  >
                    <div>
                      <p className="text-sm font-medium text-move-navy">
                        {provider.company_name}
                      </p>
                      <p className="text-xs text-neutral-muted">
                        {provider.location || "—"}
                      </p>
                    </div>
                    <StatusBadge status={provider.status as ProviderStatus} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <div className="flex items-center justify-between gap-3">
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link href={`/dashboard/new/${id}/providers`} />}
              className="px-4 py-2.5"
            >
              ← Back to Add 3PLs
            </Button>
            <Button
              nativeButton={false}
              render={<Link href={`/projects/${id}`} />}
              className="px-4 py-2.5"
            >
              Finish
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

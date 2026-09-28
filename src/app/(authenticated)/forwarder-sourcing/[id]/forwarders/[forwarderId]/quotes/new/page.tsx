import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOwnershipContext } from "@/lib/auth/get-ownership-context";
import { QuoteForm } from "../quote-form";

export default async function NewQuotePage({
  params,
}: PageProps<"/forwarder-sourcing/[id]/forwarders/[forwarderId]/quotes/new">) {
  const { id, forwarderId } = await params;

  const { canWrite } = await getOwnershipContext(id, "forwarder_projects");
  if (!canWrite) {
    notFound();
  }

  const supabase = await createClient();
  const { data: forwarder } = await supabase
    .from("forwarders")
    .select("id, company_name")
    .eq("id", forwarderId)
    .eq("forwarder_project_id", id)
    .single();

  if (!forwarder) {
    notFound();
  }

  // Scenario groups already used anywhere on this project, so the exact
  // same text is the easy pick for a comparable quote.
  const { data: existingQuotes } = await supabase
    .from("forwarder_quotes")
    .select("scenario_group, forwarders!inner(forwarder_project_id)")
    .eq("forwarders.forwarder_project_id", id);
  const existingScenarioGroups = [
    ...new Set((existingQuotes ?? []).map((q) => q.scenario_group)),
  ].sort();

  return (
    <div className="mx-auto max-w-4xl px-8 py-10">
      <Link
        href={`/forwarder-sourcing/${id}/forwarders/${forwarderId}`}
        className="text-sm font-medium text-move-green hover:underline"
      >
        ← Back to {forwarder.company_name}
      </Link>

      <h1 className="mt-2 mb-8 font-display text-2xl font-semibold text-move-navy">
        Add Quote
      </h1>

      <QuoteForm
        projectId={id}
        forwarderId={forwarderId}
        quoteId={null}
        existingScenarioGroups={existingScenarioGroups}
        cancelHref={`/forwarder-sourcing/${id}/forwarders/${forwarderId}`}
      />
    </div>
  );
}

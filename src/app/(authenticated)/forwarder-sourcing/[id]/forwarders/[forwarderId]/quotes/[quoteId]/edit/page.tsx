import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOwnershipContext } from "@/lib/auth/get-ownership-context";
import {
  QUOTE_FIELDS_SELECT,
  type QuoteFields,
} from "@/lib/forwarder/parse-quote-form";
import { QuoteForm } from "../../quote-form";

export default async function EditQuotePage({
  params,
}: PageProps<"/forwarder-sourcing/[id]/forwarders/[forwarderId]/quotes/[quoteId]/edit">) {
  const { id, forwarderId, quoteId } = await params;

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

  const { data: quote } = await supabase
    .from("forwarder_quotes")
    .select(QUOTE_FIELDS_SELECT)
    .eq("id", quoteId)
    .eq("forwarder_id", forwarderId)
    .single();
  if (!quote) {
    notFound();
  }
  // The select string above is built at runtime, so Supabase can't infer
  // its columns from the literal type; the Zod-derived type is the real
  // contract here (see QUOTE_FIELDS_SELECT).
  const fields = quote as unknown as QuoteFields;

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
        Edit Quote
      </h1>

      <QuoteForm
        projectId={id}
        forwarderId={forwarderId}
        quoteId={quoteId}
        defaultValues={fields}
        existingScenarioGroups={existingScenarioGroups}
        cancelHref={`/forwarder-sourcing/${id}/forwarders/${forwarderId}`}
      />
    </div>
  );
}

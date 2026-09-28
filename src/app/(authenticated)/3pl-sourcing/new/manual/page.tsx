import { WizardSteps } from "@/components/wizard-steps";
import { createClient } from "@/lib/supabase/server";
import { defaultClientSelection, listClients } from "@/lib/clients";
import { ClientIntakeForm } from "../client-intake-form";

export default async function NewProjectManualPage() {
  const clients = await listClients(await createClient());

  return (
    <div className="max-w-5xl px-8 py-10">
      <div className="mb-8">
        <p className="text-xs font-medium tracking-wide text-neutral-muted uppercase">
          New Project
        </p>
        <h1 className="mt-1 font-display text-2xl font-semibold text-move-navy">
          Project Info
        </h1>
        <p className="mt-1 text-sm text-neutral-muted">
          Choose the client, then capture this project&apos;s requirements.
          Fields left blank can be filled in later.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-8 md:grid-cols-[180px_1fr]">
        <WizardSteps currentStep={1} />

        <div className="rounded-2xl border border-neutral-border bg-white p-6 shadow-sm">
          <ClientIntakeForm
            projectId={null}
            clients={clients}
            initialClient={defaultClientSelection(clients)}
            backHref="/3pl-sourcing/new"
            backLabel="← Back"
          />
        </div>
      </div>
    </div>
  );
}

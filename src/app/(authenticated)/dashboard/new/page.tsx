import Link from "next/link";
import { WizardSteps } from "@/components/wizard-steps";
import { ClientIntakeForm } from "./client-intake-form";

export default function NewProjectPage() {
  return (
    <div className="max-w-5xl px-8 py-10">
      <Link
        href="/dashboard"
        className="text-sm font-medium text-move-green hover:underline"
      >
        ← Back to Dashboard
      </Link>

      <div className="mt-2 mb-8">
        <p className="text-xs font-medium tracking-wide text-neutral-muted uppercase">
          New Project
        </p>
        <h1 className="mt-1 font-display text-2xl font-semibold text-move-navy">
          Client Intake
        </h1>
        <p className="mt-1 text-sm text-neutral-muted">
          Everything captured here writes to the client record. Fields left
          blank can be filled in later.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-8 md:grid-cols-[180px_1fr]">
        <WizardSteps currentStep={1} />

        <div className="rounded-2xl border border-neutral-border bg-white p-6 shadow-sm">
          <ClientIntakeForm clientRequirementId={null} />
        </div>
      </div>
    </div>
  );
}

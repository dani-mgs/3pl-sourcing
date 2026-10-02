import {
  ConceptsSection,
  ExportSection,
  PermissionsSection,
  UploadSection,
} from "./concept-sections";
import { FaqSection } from "./faq-section";
import { TariffSection } from "./tariff-section";
import { ForwarderSection, OverviewSection, ThreePlSection } from "./workflow-sections";

const CONTENTS = [
  { id: "overview", label: "What it's for" },
  { id: "three-pl", label: "3PL Sourcing" },
  { id: "forwarder", label: "Forwarder Sourcing" },
  { id: "tariff", label: "Tariff Calculator" },
  { id: "concepts", label: "Key concepts" },
  { id: "upload", label: "AI document upload" },
  { id: "exports", label: "Exports" },
  { id: "permissions", label: "Permissions" },
  { id: "faq", label: "FAQ" },
];

// Static how-to page for any signed-in user (the (authenticated) layout
// handles sign-in). No data access. When behavior described here changes,
// update it in the same change (AGENTS.md).
export default function HelpPage() {
  return (
    <div className="mx-auto max-w-6xl px-8 py-10 max-sm:px-4">
      <h1 className="mb-2 font-display text-2xl font-semibold text-move-navy">How to use the Decision Hub</h1>
      <p className="mb-8 text-sm text-neutral-muted">
        Workflows, the rules behind the numbers, and answers to common questions.
      </p>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[200px_minmax(0,1fr)]">
        <nav aria-label="On this page" className="self-start xl:sticky xl:top-24">
          <p className="mb-2 text-xs font-medium tracking-wide text-neutral-muted uppercase">
            On this page
          </p>
          <ol className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm xl:flex-col">
            {CONTENTS.map((item) => (
              <li key={item.id}>
                <a
                  href={`#${item.id}`}
                  className="rounded text-move-navy outline-none hover:text-move-green hover:underline focus-visible:ring-2 focus-visible:ring-move-green"
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="flex min-w-0 flex-col gap-6">
          <OverviewSection />
          <ThreePlSection />
          <ForwarderSection />
          <TariffSection />
          <ConceptsSection />
          <UploadSection />
          <ExportSection />
          <PermissionsSection />
          <FaqSection />
        </div>
      </div>
    </div>
  );
}

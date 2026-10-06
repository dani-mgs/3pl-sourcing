import { FaqBrowser } from "./faq-browser";
import { HelpSection } from "./help-parts";

// The FAQ's questions and answers are in faq-items-*.tsx, each tagged with
// its module; their answers restate rules from concept-sections.tsx /
// workflow-sections.tsx / tariff-section.tsx, so keep them in step.
export function FaqSection() {
  return (
    <HelpSection id="faq" title="FAQ">
      <FaqBrowser />
    </HelpSection>
  );
}

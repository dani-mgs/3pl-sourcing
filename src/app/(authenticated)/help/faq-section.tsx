import { Faq, HelpSection } from "./help-parts";

// Each answer restates a rule from concept-sections.tsx / workflow-sections.tsx;
// keep them in step.

export function FaqSection() {
  return (
    <HelpSection id="faq" title="FAQ">
      <div className="flex flex-col gap-2">
        <Faq question="Why is my quote Not Comparable?">
          <p>
            Its incoterm, mode, or type doesn&apos;t match the project&apos;s final terms, or its
            completeness is &ldquo;Incomplete / Needs Clarification&rdquo;. Check both on the
            quote, and that all three final terms are set on the project.
          </p>
        </Faq>
        <Faq question="Why doesn't the Best quote tile show my cheapest quote?">
          <p>
            It only considers ranked quotes. A cheaper quote may be Not Comparable (terms or
            completeness) or Excluded from ranking (its forwarder is Unfit, Do Not Contact, or
            Withdrawn / No Response).
          </p>
        </Faq>
        <Faq question="Why is my quote ranked but its vs Baseline says Not Comparable?">
          <p>
            Ranking uses the final terms; savings use the current terms. If the two differ, a
            quote can match one and not the other.
          </p>
        </Faq>
        <Faq question="Why don't two of my quotes compare with each other?">
          <p>
            They&apos;re in different scenario groups. The names must match exactly, including
            capitals; choose an existing name from the suggestions when you type it.
          </p>
        </Faq>
        <Faq question="Why is my exchange rate blank?">
          <p>
            The quote isn&apos;t in USD and no rate has been entered yet: either the uploaded
            document didn&apos;t state one, or the currency was changed. Enter the rate (USD per
            1 unit of the quote&apos;s currency) to save.
          </p>
        </Faq>
        <Faq question={'Why does requirement fit say "Not confirmed" when the forwarder offers it?'}>
          <p>
            The capability isn&apos;t ticked on the forwarder. Unticked means not yet confirmed.
            Edit the forwarder and tick it once confirmed.
          </p>
        </Faq>
        <Faq question="Why can't I edit this project?">
          <p>
            Only its owner or an admin can. If you see &ldquo;Owned by … — view only&rdquo;, ask
            the owner, or an admin to reassign it to you.
          </p>
        </Faq>
        <Faq question="Why can't I delete this forwarder project?">
          <p>A forwarder project can only be deleted once it has no forwarders. Delete them first.</p>
        </Faq>
      </div>
    </HelpSection>
  );
}

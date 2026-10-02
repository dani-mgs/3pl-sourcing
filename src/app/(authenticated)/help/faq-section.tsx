import { Faq, HelpSection } from "./help-parts";

// Each answer restates a rule from concept-sections.tsx / workflow-sections.tsx
// / tariff-section.tsx; keep them in step.

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
            The quote isn&apos;t in USD, the document didn&apos;t state a rate, and there&apos;s no
            daily rate for that currency yet. Enter the rate (USD per 1 unit of the quote&apos;s
            currency) to save.
          </p>
        </Faq>
        <Faq question="Why didn't my quote's USD cost change when exchange rates moved?">
          <p>
            Rates are locked when a quote is saved, so comparisons don&apos;t shift under you.
            To use today&apos;s rate, edit the quote, click Refresh to latest rate, and save.
          </p>
        </Faq>
        <Faq question={'What does "Entered manually (date not recorded)" mean?'}>
          <p>
            The quote was entered before the app recorded where rates came from. Its rate is
            unchanged; refresh it or type a new one if you want a dated rate.
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
        <Faq question="Why does the Tariff Calculator ask for a quantity?">
          <p>
            The line&apos;s duty is charged per unit (per kg, liter, pair…), not only as a
            percentage of value. Enter the quantity in the unit the message names. HTS weights
            are net weights, not the shipment&apos;s gross weight.
          </p>
        </Faq>
        <Faq question="Why can't the Tariff Calculator estimate my HTS code?">
          <p>
            Either the code isn&apos;t in the current HTS release (check it, and enter all 10
            digits if asked), or its rate depends on details the calculator can&apos;t evaluate,
            such as metal content or the value of a watch case. Ask your customs broker for those.
          </p>
        </Faq>
        <Faq question="Why aren't Section 301 or Section 232 duties in my estimate?">
          <p>
            Additional duties aren&apos;t calculated yet. When any may apply to your origin or
            HTS code, the total says it EXCLUDES them and names them right under it, so
            it never reads as complete. Check them with your customs broker.
          </p>
        </Faq>
        <Faq question="Why is my customs broker's figure different?">
          <p>
            The estimate leaves out additional duties, AD/CVD and trade-agreement savings, uses
            the exchange rate shown rather than CBP&apos;s certified rate, and treats the line
            as a whole entry for the MPF minimum and maximum. Your broker&apos;s entry is the
            one that counts.
          </p>
        </Faq>
        <Faq question="Why didn't my saved estimate change when rates changed?">
          <p>
            Saved estimates are locked with the rates and dates they used. Calculate again and
            save a new estimate to use the current rates.
          </p>
        </Faq>
      </div>
    </HelpSection>
  );
}

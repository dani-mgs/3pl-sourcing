import type { FaqItem } from "@/lib/help/faq";

// Forwarder Sourcing and General FAQ items. Each answer restates a rule from
// concept-sections.tsx / workflow-sections.tsx; keep them in step.
export const FORWARDER_AND_GENERAL_FAQ: FaqItem[] = [
  {
    id: "quote-not-comparable",
    module: "Forwarder Sourcing",
    question: "Why is my quote Not Comparable?",
    answer: (
      <>
        <p>
          Its incoterm, mode, or type doesn&apos;t match the project&apos;s final terms, or its
          completeness is &ldquo;Incomplete / Needs Clarification&rdquo;. Check both on the
          quote, and that all three final terms are set on the project.
        </p>
      </>
    ),
  },
  {
    id: "best-quote-tile",
    module: "Forwarder Sourcing",
    question: "Why doesn't the Best quote tile show my cheapest quote?",
    answer: (
      <>
        <p>
          It only considers ranked quotes. A cheaper quote may be Not Comparable (terms or
          completeness) or Excluded from ranking (its forwarder is Unfit, Do Not Contact, or
          Withdrawn / No Response).
        </p>
      </>
    ),
  },
  {
    id: "freight-cost-ratio",
    module: "Forwarder Sourcing",
    question: "What is the Freight Cost Ratio, and why is it blank?",
    answer: (
      <>
        <p>
          It&apos;s a quote&apos;s freight cost in USD divided by the project&apos;s invoice
          value, shown to one decimal (for example 15.7%). Duties, taxes, and other charges are
          left out. It needs an invoice value above zero in USD on the project (Customs &amp;
          Value, via Edit); otherwise it&apos;s blank and the tile says what to set.
        </p>
      </>
    ),
  },
  {
    id: "ranked-vs-baseline",
    module: "Forwarder Sourcing",
    question: "Why is my quote ranked but its vs Baseline says Not Comparable?",
    answer: (
      <>
        <p>
          Ranking uses the final terms; savings use the current terms. If the two differ, a
          quote can match one and not the other.
        </p>
      </>
    ),
  },
  {
    id: "quotes-dont-compare",
    module: "Forwarder Sourcing",
    question: "Why isn't one of my quotes ranked with the others?",
    answer: (
      <>
        <p>
          Quotes are ranked together when they match the project&apos;s final incoterm, mode,
          and type. A quote with different terms is still shown, greyed out below the ranked
          ones, with the rank &ldquo;Different terms&rdquo;; change the quote or the project&apos;s
          final terms if that isn&apos;t intended. A quote missing a term, or marked
          &ldquo;Incomplete / Needs Clarification&rdquo;, says &ldquo;Not Comparable&rdquo;.
        </p>
        <p>
          Old quotes keep their previous scenario group text (under &ldquo;Legacy scenario&rdquo; in
          the quote&apos;s details), but it no longer decides what is compared.
        </p>
      </>
    ),
  },
  {
    id: "exchange-rate-blank",
    module: "Forwarder Sourcing",
    question: "Why is my exchange rate blank?",
    answer: (
      <>
        <p>
          The quote isn&apos;t in USD, the document didn&apos;t state a rate, and there&apos;s no
          daily rate for that currency yet. Enter the rate (USD per 1 unit of the quote&apos;s
          currency) to save.
        </p>
      </>
    ),
  },
  {
    id: "usd-cost-locked",
    module: "Forwarder Sourcing",
    question: "Why didn't my quote's USD cost change when exchange rates moved?",
    answer: (
      <>
        <p>
          Rates are locked when a quote is saved, so comparisons don&apos;t shift under you.
          To use today&apos;s rate, edit the quote, click Refresh to latest rate, and save.
        </p>
      </>
    ),
  },
  {
    id: "entered-manually",
    module: "Forwarder Sourcing",
    question: "What does \"Entered manually (date not recorded)\" mean?",
    answer: (
      <>
        <p>
          The quote was entered before the app recorded where rates came from. Its rate is
          unchanged; refresh it or type a new one if you want a dated rate.
        </p>
      </>
    ),
  },
  {
    id: "requirement-not-confirmed",
    module: "Forwarder Sourcing",
    question: "Why does requirement fit say \"Not confirmed\" when the forwarder offers it?",
    answer: (
      <>
        <p>
          The capability isn&apos;t ticked on the forwarder. Unticked means not yet confirmed.
          Edit the forwarder and tick it once confirmed.
        </p>
      </>
    ),
  },
  {
    id: "cant-edit-project",
    module: "General",
    question: "Why can't I edit this project?",
    answer: (
      <>
        <p>
          Only its owner or an admin can. If you see &ldquo;Owned by … — view only&rdquo;, ask
          the owner, or an admin to reassign it to you.
        </p>
      </>
    ),
  },
  {
    id: "cant-delete-forwarder-project",
    module: "Forwarder Sourcing",
    question: "Why can't I delete this forwarder project?",
    answer: (
      <>
        <p>A forwarder project can only be deleted once it has no forwarders. Delete them first.</p>
      </>
    ),
  },
];

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
        <Faq question={"Why doesn't my HTS search find \"shoes\"?"}>
          <p>
            The HTS uses formal tariff wording: &ldquo;footwear&rdquo;, not &ldquo;shoes&rdquo;;
            &ldquo;apparel&rdquo; or &ldquo;garments&rdquo; rather than &ldquo;clothes&rdquo;. Try the material and
            the product type (&ldquo;rubber footwear&rdquo;, &ldquo;cotton shirts&rdquo;), or search the 4-digit
            heading to see everything under it. Every word must appear, and common words like &ldquo;other&rdquo;
            are ignored. The search finds candidate lines only; classification is the importer&apos;s
            responsibility, so confirm with your customs broker.
          </p>
        </Faq>
        <Faq question="Why can't the Tariff Calculator estimate my HTS code?">
          <p>
            Either the code isn&apos;t in the current HTS release (check it, and enter all 10
            digits if asked), or its rate depends on details the calculator can&apos;t evaluate,
            such as metal content or the value of a watch case. Ask your customs broker for those.
          </p>
        </Faq>
        <Faq question="Why isn't a Section 301 or Section 232 duty in my estimate?">
          <p>
            Only programs a tariff editor has reviewed are counted. Others that may apply to your
            origin or HTS code are named under the total, which says it EXCLUDES them, so it never
            reads as complete. Section 232 on steel, aluminium and copper and China Section 301 are
            loaded; Section 232 on vehicles, timber, semiconductors, pharmaceuticals and drones
            isn&apos;t yet.
          </p>
        </Faq>
        <Faq question={'What does "pending expert review" mean?'}>
          <p>
            The program&apos;s duty data is loaded but hasn&apos;t been reviewed since it was added or
            last changed, so it isn&apos;t counted in totals yet. A tariff editor reviews it against
            the Federal Register and HTS notes and marks it reviewed.
          </p>
        </Faq>
        <Faq question={'Why does it say "exempt if Section 232 applies"?'}>
          <p>
            Forced-labour and Brazil Section 301 duties don&apos;t apply to goods subject to Section
            232 (steel, aluminium, copper, vehicles, wood products, semiconductors, patented
            pharmaceuticals). Where that Section 232 duty isn&apos;t calculated (not loaded, or pending
            review), the calculator can&apos;t tell which applies and names both instead of guessing.
            Where Section 232 is counted, the other duty shows as exempt, with what it would add if
            Section 232 turned out not to apply.
          </p>
        </Faq>
        <Faq question={'Why does a duty line say "could be … instead if …"?'}>
          <p>
            The rate depends on a fact the calculator can&apos;t check, such as whether UK steel was
            melted and poured in the UK or how much U.S. metal an article contains. The estimate uses
            the higher rate, so it never understates the duty, and names the lower one with the
            condition. Ask your broker whether your goods qualify.
          </p>
        </Faq>
        <Faq question="Why is a China product exclusion named but not applied?">
          <p>
            USTR&apos;s exclusions cover particular products described in words, not whole HTS codes,
            so the calculator can&apos;t tell whether yours qualifies. It names the exclusion and the
            date it runs to; verify with your broker before relying on it.
          </p>
        </Faq>
        <Faq question="Who can change duty rates or fees?">
          <p>
            Tariff editors and admins, in Tariff Calculator → Duty data. Ask an admin for the tariff
            editor permission. Changes put the program back to pending review until someone reviews it, except
            an edit of only a row&apos;s source (citation, links, checked date).
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
        <Faq question="Why does our estimate differ from the forwarder's?">
          <p>
            Forwarders often include things our estimate doesn&apos;t: import VAT or other taxes,
            brokerage and entry fees, bond costs, or a margin. Our estimate may also leave out
            additional duty programs (its total says EXCLUDES when it does) and never applies
            trade-agreement savings. The customs value can differ too: we use the confirmed goods value
            less freight and insurance, while the forwarder may have used the CIF value or a different
            exchange rate. Both are for one shipment as described on the project. A large gap is
            flagged &ldquo;Check with forwarder&rdquo;: ask what their figure includes.
          </p>
        </Faq>
        <Faq question="Why didn't the calculator fill in the origin from my project?">
          <p>
            The project&apos;s origin is free text. The calculator only fills it in when it names exactly
            one country; &ldquo;Korea&rdquo;, &ldquo;China / Vietnam&rdquo; or a city on its own could mean
            more than one, so you pick. A wrong origin would change which duties apply.
          </p>
        </Faq>
        <Faq question={'Why does a duty estimate say "Inputs changed since this estimate"?'}>
          <p>
            Something it was built from (the HS code, origin, invoice value, incoterm, current freight
            cost, the quote&apos;s mode or quoted duties) has been edited since it was saved. Saved
            estimates are locked; create a new one from the project or quote to use the new values.
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

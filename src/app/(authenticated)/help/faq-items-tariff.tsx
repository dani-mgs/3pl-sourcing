import type { FaqItem } from "@/lib/help/faq";

// Tariff Calculator FAQ items. Each answer restates a rule from
// tariff-section.tsx; keep them in step.
export const TARIFF_FAQ: FaqItem[] = [
  {
    id: "quantity",
    module: "Tariff Calculator",
    page: "Estimating duties",
    question: "Why does the Tariff Calculator ask for a quantity?",
    answer: (
      <>
        <p>
          The line&apos;s duty is charged per unit (per kg, liter, pair…), not only as a
          percentage of value. Enter the quantity in the unit the message names. HTS weights
          are net weights, not the shipment&apos;s gross weight.
        </p>
      </>
    ),
  },
  {
    id: "entry-date",
    module: "Tariff Calculator",
    page: "Estimating duties",
    question: "What is the expected entry date, and what is it set to?",
    answer: (
      <>
        <p>
          Duty applies on the day the goods enter the US, not the day you calculate. The
          calculator uses the fees, additional duties and column 2 list in force on that day. It
          starts as today; for an estimate opened from a quote it is today plus the quote&apos;s
          longest lead time (28–32 days gives 32). You can change it to any day from yesterday
          (UTC) to 366 days ahead.
        </p>
      </>
    ),
  },
  {
    id: "entry-date-past",
    module: "Tariff Calculator",
    page: "Estimating duties",
    question: "Why can't I choose a past entry date?",
    answer: (
      <>
        <p>
          Base duty rates come from the current HTS schedule only; the calculator doesn&apos;t keep
          earlier schedules or the history of past additional duties, so it can&apos;t say what
          applied on a day that has gone. Yesterday (UTC) is allowed so that a date picked in a time
          zone west of UTC isn&apos;t refused. For an entry that has already happened, ask your customs broker.
        </p>
      </>
    ),
  },
  {
    id: "entry-date-base-rate-note",
    module: "Tariff Calculator",
    page: "Estimating duties",
    question: "Why does an estimate for a later entry date say the base rate is from today's schedule?",
    answer: (
      <>
        <p>
          The base rate is from the HTS schedule in force today (the revision is named). If USITC
          publishes a change before your entry date, it isn&apos;t in the estimate. Additional duties
          and fees are those known today to be in force on the entry date, so later announcements
          aren&apos;t included either. Calculate again closer to the entry date.
        </p>
      </>
    ),
  },
  {
    id: "search-shoes",
    module: "Tariff Calculator",
    page: "HTS lookup",
    question: "Why doesn't my HTS search find \"shoes\"?",
    answer: (
      <>
        <p>
          The HTS uses formal tariff wording: &ldquo;footwear&rdquo;, not &ldquo;shoes&rdquo;;
          &ldquo;apparel&rdquo; or &ldquo;garments&rdquo; rather than &ldquo;clothes&rdquo;. Try the material and
          the product type (&ldquo;rubber footwear&rdquo;, &ldquo;cotton shirts&rdquo;), or search the 4-digit
          heading to see everything under it. Every word must appear, and common words like &ldquo;other&rdquo;
          are ignored. The search finds candidate lines only; classification is the importer&apos;s
          responsibility, so confirm with your customs broker.
        </p>
      </>
    ),
  },
  {
    id: "find-hts-code",
    module: "Tariff Calculator",
    page: "HTS lookup",
    question: "How do I find an HTS code?",
    answer: (
      <>
        <p>
          In the Tariff Calculator, click <strong>Look up code</strong> next to the HTS code field. A window
          opens. Type words (&ldquo;rubber footwear&rdquo;) or the start of a code (&ldquo;6402&rdquo;), then press
          Enter or Search. Results are grouped by heading and listed in code order, not ranked.{" "}
          <strong>Browse heading</strong> shows every line under a heading. What you&apos;ve already typed in the
          calculator stays as it is.
        </p>
        <p>
          The search only helps you find candidate lines. Choosing the right code is the importer&apos;s
          responsibility, so confirm it with your customs broker.
        </p>
      </>
    ),
  },
  {
    id: "use-this-code",
    module: "Tariff Calculator",
    page: "HTS lookup",
    question: 'What does "Use this code" do?',
    answer: (
      <>
        <p>
          It closes the window and puts that code in the calculator&apos;s HTS code field, with its official
          description to check against your goods. Nothing else in the form changes. If you opened the calculator
          from a forwarder project or quote, tick Confirmed for the HTS code again.
        </p>
        <p>
          The code is used for that estimate only. It never changes the HS code saved on the project.
        </p>
      </>
    ),
  },
  {
    id: "no-use-this-code",
    module: "Tariff Calculator",
    page: "HTS lookup",
    question: 'Why does a line have no "Use this code" button?',
    answer: (
      <>
        <p>
          Only complete lines can be used: 8- or 10-digit lines with no more detailed lines under them. Headings
          and subheadings are just groups, and the calculator doesn&apos;t take chapters 98 and 99. Click{" "}
          <strong>Browse heading</strong> and choose a line under the group. A line that says &ldquo;Choose a
          10-digit line under it&rdquo; has several more detailed lines below it.
        </p>
      </>
    ),
  },
  {
    id: "may-apply-badge",
    module: "Tariff Calculator",
    page: "HTS lookup",
    question: 'What does "may apply" on a line mean?',
    answer: (
      <>
        <p>
          It names an extra duty program, such as Section 301 or Section 232, that can apply to goods in that
          heading, sometimes only from certain countries (&ldquo;if from China&rdquo;). It shows no amount and
          doesn&apos;t mean your goods are covered. Enter the code and the origin in the calculator: the estimate
          counts the programs a tariff editor has reviewed and names the rest under the total. Programs that
          depend only on the country of origin aren&apos;t shown in the lookup.
        </p>
      </>
    ),
  },
  {
    id: "cant-estimate-code",
    module: "Tariff Calculator",
    page: "Estimating duties",
    question: "Why can't the Tariff Calculator estimate my HTS code?",
    answer: (
      <>
        <p>
          Either the code isn&apos;t in the current HTS release (check it, and enter all 10
          digits if asked), or its rate depends on details the calculator can&apos;t evaluate,
          such as metal content or the value of a watch case. Ask your customs broker for those.
        </p>
      </>
    ),
  },
  {
    id: "duty-not-in-estimate",
    module: "Tariff Calculator",
    page: "Additional duties",
    question: "Why isn't a Section 301 or Section 232 duty in my estimate?",
    answer: (
      <>
        <p>
          Only programs a tariff editor has reviewed are counted. Others that may apply to your
          origin or HTS code are named under the total, which says it EXCLUDES them, so it never
          reads as complete. Section 232 on steel, aluminium and copper and China Section 301 are
          loaded; Section 232 on vehicles, timber, semiconductors, pharmaceuticals and drones
          isn&apos;t yet.
        </p>
      </>
    ),
  },
  {
    id: "pending-review",
    module: "Tariff Calculator",
    page: "Additional duties",
    question: "What does \"pending expert review\" mean?",
    answer: (
      <>
        <p>
          The program&apos;s duty data is loaded but hasn&apos;t been reviewed since it was added or
          last changed, so it isn&apos;t counted in totals yet. A tariff editor reviews it against
          the Federal Register and HTS notes and marks it reviewed.
        </p>
      </>
    ),
  },
  {
    id: "exempt-if-232",
    module: "Tariff Calculator",
    page: "Additional duties",
    question: "Why does it say \"exempt if Section 232 applies\"?",
    answer: (
      <>
        <p>
          Forced-labour and Brazil Section 301 duties don&apos;t apply to goods subject to Section
          232 (steel, aluminium, copper, vehicles, wood products, semiconductors, patented
          pharmaceuticals). Where that Section 232 duty isn&apos;t calculated (not loaded, or pending
          review), the calculator can&apos;t tell which applies and names both instead of guessing.
          Where Section 232 is counted, the other duty shows as exempt, with what it would add if
          Section 232 turned out not to apply.
        </p>
      </>
    ),
  },
  {
    id: "could-be-instead",
    module: "Tariff Calculator",
    page: "Additional duties",
    question: "Why does a duty line say \"could be … instead if …\"?",
    answer: (
      <>
        <p>
          The rate depends on a fact the calculator can&apos;t check, such as whether UK steel was
          melted and poured in the UK or how much U.S. metal an article contains. The estimate uses
          the higher rate, so it never understates the duty, and names the lower one with the
          condition. Ask your broker whether your goods qualify.
        </p>
      </>
    ),
  },
  {
    id: "china-exclusion",
    module: "Tariff Calculator",
    page: "Additional duties",
    question: "Why is a China product exclusion named but not applied?",
    answer: (
      <>
        <p>
          USTR&apos;s exclusions cover particular products described in words, not whole HTS codes,
          so the calculator can&apos;t tell whether yours qualifies. It names the exclusion and the
          date it runs to; verify with your broker before relying on it.
        </p>
      </>
    ),
  },
  {
    id: "who-changes-duty-data",
    module: "Tariff Calculator",
    page: "Duty data",
    question: "Who can change duty rates or fees?",
    answer: (
      <>
        <p>
          Tariff editors and admins, in Tariff Calculator → Duty data. Ask an admin for the tariff
          editor permission. Changes put the program back to pending review until someone reviews it, except
          an edit of only a row&apos;s source (citation, links, checked date).
        </p>
      </>
    ),
  },
  {
    id: "broker-figure",
    module: "Tariff Calculator",
    page: "Estimating duties",
    question: "Why is my customs broker's figure different?",
    answer: (
      <>
        <p>
          The estimate may leave out additional duties (any program not yet reviewed is named
          under the total), always leaves out AD/CVD and trade-agreement savings, uses the
          exchange rate shown rather than CBP&apos;s certified rate, and treats the line as a
          whole entry for the MPF minimum and maximum. Your broker&apos;s entry is the one that
          counts.
        </p>
      </>
    ),
  },
  {
    id: "differs-from-forwarder",
    module: "Tariff Calculator",
    page: "Estimating duties",
    question: "Why does our estimate differ from the forwarder's?",
    answer: (
      <>
        <p>
          Forwarders often include things our estimate doesn&apos;t: import VAT or other taxes,
          brokerage and entry fees, bond costs, or a margin. Our estimate may also leave out
          additional duty programs (its total says EXCLUDES when it does) and never applies
          trade-agreement savings. The customs value can differ too: we use the confirmed goods value
          less freight and insurance, while the forwarder may have used the CIF value or a different
          exchange rate. Both are for one shipment as described on the project. A large gap is
          flagged &ldquo;Check with forwarder&rdquo;: ask what their figure includes.
        </p>
      </>
    ),
  },
  {
    id: "origin-not-filled",
    module: "Tariff Calculator",
    page: "Estimating duties",
    question: "Why didn't the calculator fill in the origin from my project?",
    answer: (
      <>
        <p>
          The project&apos;s origin is free text. The calculator only fills it in when it names exactly
          one country; &ldquo;Korea&rdquo;, &ldquo;China / Vietnam&rdquo; or a city on its own could mean
          more than one, so you pick. A wrong origin would change which duties apply.
        </p>
      </>
    ),
  },
  {
    id: "inputs-changed",
    module: "Tariff Calculator",
    page: "Estimating duties",
    question: "Why does a duty estimate say \"Inputs changed since this estimate\"?",
    answer: (
      <>
        <p>
          Something it was built from (the HS code, origin, invoice value, incoterm, current freight
          cost, the quote&apos;s mode, quoted duties, or its lead time when the expected entry date came from it) has been edited since it was saved. Saved
          estimates are locked; create a new one from the project or quote to use the new values.
        </p>
      </>
    ),
  },
  {
    id: "saved-estimate-locked",
    module: "Tariff Calculator",
    page: "Estimating duties",
    question: "Why didn't my saved estimate change when rates changed?",
    answer: (
      <>
        <p>
          Saved estimates are locked with the rates and dates they used. Calculate again and
          save a new estimate to use the current rates.
        </p>
      </>
    ),
  },
];

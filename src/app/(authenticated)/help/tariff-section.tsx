import { ESTIMATE_CAVEATS, ESTIMATE_DISCLAIMER } from "@/lib/tariff/caveats";
import {
  DEDUCTION_NOTE,
  DEDUCTION_PROMPT,
  DELIVERED_INCOTERMS,
  DUTY_DIFFERENCE_FLAG_SHARE,
  DUTY_DIFFERENCE_FLAG_USD,
  QUANTITY_HINT,
} from "@/lib/tariff/forwarder-link";
import { LOOKUP_GUARDRAIL, RESULT_LIMIT } from "@/lib/tariff/hts-lookup";
import { Bullets, HelpSection, Note, Steps, SubHeading, Ui } from "./help-parts";

// The Tariff Calculator's workflow and rules. Mirrors src/lib/tariff (the
// calculation, warnings and caveats); keep in step (AGENTS.md).

export function TariffSection() {
  return (
    <HelpSection id="tariff" title="Tariff Calculator">
      <p>
        Estimates US import duty and fees for one HTS line. <Ui>{ESTIMATE_DISCLAIMER}</Ui> It is
        not a customs ruling, and HTS classification is the importer&apos;s responsibility: the
        calculator uses the code you enter and doesn&apos;t check that it fits your goods.
      </p>
      <Steps>
        <li>
          <Ui>Tariff Calculator</Ui>: enter the <Ui>HTS code</Ui> (8 or 10 digits; 10 is
          better), <Ui>Country of origin</Ui>, <Ui>Shipment mode</Ui> and{" "}
          <Ui>Customs value</Ui> with its currency.
        </li>
        <li>
          For a non-USD value, the latest daily rate is filled in; type over it to use your own.
        </li>
        <li>
          If the line&apos;s rate is charged per unit (per kg, liter, pair…), enter the{" "}
          <Ui>Quantity</Ui> in that unit.
        </li>
        <li>
          <Ui>Calculate</Ui> to see the estimate. <Ui>Save estimate</Ui> recalculates with the
          current data and locks it.
        </li>
      </Steps>
      <SubHeading>Look up HTS code</SubHeading>
      <p>
        Helps you find candidate lines in the official schedule. It never classifies a product or suggests a code:{" "}
        <Ui>{LOOKUP_GUARDRAIL}</Ui> There are no AI suggestions.
      </p>
      <Steps>
        <li>
          <Ui>Look up code</Ui>, beside the calculator&apos;s <Ui>HTS code</Ui> field, opens a popup. Any
          signed-in user can use it, and nothing you&apos;ve typed in the form is lost.
        </li>
        <li>
          Type words (&ldquo;footwear rubber&rdquo;) or a code (&ldquo;6402&rdquo;, &ldquo;6402.99&rdquo; or
          &ldquo;640299&rdquo; show everything under it), then press Enter or <Ui>Search</Ui>. It searches the
          current HTS release, named at the top of the popup. Your last search is still there if you close and
          reopen it.
        </li>
        <li>
          <Ui>Browse heading</Ui> opens a heading as a tree you expand and collapse.
        </li>
        <li>
          <Ui>Use this code</Ui> closes the popup and fills the code into the <Ui>HTS code</Ui> field, with its
          official description. Check that it matches the goods. Nothing else in the form changes, except that on
          a linked estimate you need to tick <Ui>Confirmed</Ui> for the HTS code again. The code is used for that
          estimate only; the project&apos;s own HS code isn&apos;t changed.
        </li>
      </Steps>
      <Bullets>
        <li>
          Words match from their start (&ldquo;foot&rdquo; finds &ldquo;footwear&rdquo;) and every word must appear,
          in the line or the lines above it, so a line that only says &ldquo;Other&rdquo; is found by its
          parents&apos; words. Common words like &ldquo;other&rdquo; are ignored.
        </li>
        <li>
          Results are grouped by heading and listed in code order, not ranked by &ldquo;best match&rdquo;. Up to{" "}
          {RESULT_LIMIT} lines are shown; refine the search when there are more.
        </li>
        <li>
          Each line shows its full path (chapter → heading → subheading → line), the general rate (marked when the
          calculator can&apos;t work it out), its units, and the additional duty programs that <em>may</em> apply
          to its chapter or heading, with no amounts. Programs that depend on origin alone aren&apos;t shown there;
          the estimate names them.
        </li>
        <li>
          <Ui>CBP rulings (CROSS)</Ui> opens CBP&apos;s rulings search for the heading in a new tab.
        </li>
        <li>
          Only 8- or 10-digit lines with nothing under them, outside chapters 98 and 99, can be used in the
          calculator.
        </li>
      </Bullets>

      <SubHeading>How the estimate is worked out</SubHeading>
      <Bullets>
        <li>
          <Ui>Base duty</Ui>: the HTS general (column 1) rate for the line, from the current
          HTS release published by the US International Trade Commission. Goods of a column 2
          country (currently Cuba, North Korea, Russia and Belarus) use the column 2 rate.
        </li>
        <li>
          A percentage rate applies to the customs value; a per-unit rate is multiplied by the
          quantity; a compound rate (e.g. 0.4¢/kg + 20%) adds both.
        </li>
        <li>
          Rates that depend on anything else (&ldquo;on drained weight&rdquo;, &ldquo;on the
          case&rdquo;, &ldquo;the rate applicable to…&rdquo;) aren&apos;t calculated; the
          calculator says so rather than guess.
        </li>
        <li>
          <Ui>Expected entry date</Ui>: duty applies on the day the goods enter the US, so the
          fees, the column 2 country list and the additional duties are those in force on that
          day. It starts as today (or, for a quote, today plus the quote&apos;s longest lead time)
          and you can change it from yesterday (UTC) to 366 days ahead. Past dates can&apos;t be
          chosen. The base rate is always from the HTS schedule in force today, so for a later date
          the estimate says so, and that rates announced later aren&apos;t included.
        </li>
        <li>
          <Ui>MPF</Ui> (Merchandise Processing Fee): the percentage in force on the entry date, between its
          minimum and maximum, as if this line were the whole entry. Values up to the
          informal-entry limit pay the flat informal fee instead.
        </li>
        <li>
          <Ui>HMF</Ui> (Harbor Maintenance Fee): ocean shipments only.
        </li>
        <li>Each line is rounded once, half up to the cent.</li>
        <li>
          Every line shows its rate, its source and the date it came into effect; the estimate
          shows <Ui>Estimated for entry on</Ui> the entry date and the day it was calculated.
          Exchange rates and the age of the duty-data reviews are judged on the day of calculation.
        </li>
      </Bullets>

      <SubHeading>Additional duties</SubHeading>
      <Bullets>
        <li>
          Additional duties (the forced-labour, Brazil and China Section 301 programs, and Section
          232 on steel, aluminium and copper) are added to the total only once a <Ui>tariff editor</Ui> has reviewed the
          program&apos;s data against its primary sources. Each one shows its Chapter 99 heading,
          rate, legal status (e.g. <Ui>In force — under litigation</Ui>), effective dates, source and
          the date the source was checked.
        </li>
        <li>
          <Ui>Pending expert review</Ui> means the program&apos;s data is loaded but nobody has
          reviewed it since it was added or last changed. Pending programs never count toward the
          total: the estimate names them and says what they could add.
        </li>
        <li>
          When any program that may apply isn&apos;t counted (not loaded yet, or pending review),
          the total is labelled <Ui>Base duty + fees — EXCLUDES N additional duty program(s) that may apply</Ui>{" "}
          (or <Ui>Duties + fees</Ui> when some duties are included), with each program named right
          under it. Programs with no data yet show the rate read from the HTS, marked as indicative.
        </li>
        <li>
          Programs stack, in CBP&apos;s filing order (Section 301 first, then Section 232). Some don&apos;t
          apply to goods covered by another program: forced-labour and Brazil Section 301 duties
          don&apos;t apply to Section 232 goods. While that Section 232 duty isn&apos;t settled (not
          loaded, or pending review), such goods show &ldquo;exempt if Section 232 applies&rdquo;, without
          a percentage. China Section 301 applies on top of everything, including Section 232 and the
          forced-labour duty.
        </li>
        <li>
          Within one program only one rate applies to a line (Section 232 steel and aluminium duties
          never stack). The most specific entry wins; if two still match equally, the higher rate is
          used and the other is named.
        </li>
        <li>
          When a rate depends on a fact the calculator can&apos;t check (where the steel was melted, U.S.
          metal content, metal under 15% of the weight, an end use), the estimate never assumes the fact
          that would lower the duty: it applies the higher rate and names the lower one (&ldquo;could be
          +25% (9903.82.04) instead if …&rdquo;). Tariff editors can change that per row where the typical
          case differs.
        </li>
        <li>
          A row whose rate isn&apos;t confirmed yet is never charged and never replaces a confirmed row,
          however specific it is: the confirmed rate stays in the total and the other is named (&ldquo;Could
          be +100% (9903.91.12) instead, not yet confirmed&rdquo;). Only when no confirmed row applies is
          the program listed as &ldquo;may apply&rdquo; with nothing counted.
        </li>
        <li>
          Where the base rate is low, some origins (EU, Japan, South Korea, Switzerland, Taiwan) pay a
          minimum total rate instead of a flat add-on; per-unit rates are compared as duty divided by
          customs value.
        </li>
        <li>
          Every estimate shows <Ui>Duty data last reviewed {"{date}"} by {"{name}"}</Ui> for each
          program it uses, and a warning when that review is over 30 days old or Chapter 99 headings
          changed in the HTS since.
        </li>
      </Bullets>

      <SubHeading>China Section 301 and Section 232 metals: what&apos;s covered</SubHeading>
      <Bullets>
        <li>
          <Ui>China Section 301</Ui> (goods of China): Lists 1, 2 and 3 (25%), List 4A (7.5%) and the
          2024 four-year review increases (25% to 100% on products such as semiconductors, solar cells,
          electric vehicles, batteries, steel and aluminium, medical products). The lists come from the
          HTS (U.S. notes 20 and 31), checked against USITC&apos;s China Tariffs table and USTR&apos;s
          notices. For an 8-digit code split between lists, enter the 10-digit number for an exact
          estimate.
        </li>
        <li>
          USTR&apos;s China product exclusions depend on the product&apos;s description, not just its
          code, so they&apos;re never applied: an estimate for a code named in one says &ldquo;may be
          exempt if the article is …&rdquo; with the date the exclusion runs to, and the note disappears
          once it lapses.
        </li>
        <li>
          <Ui>Section 232 metals</Ui> (any origin): steel, aluminium and copper articles at 50%,
          listed derivatives at 25% or a 15% minimum total rate, on the full customs value; Russian
          aluminium at 200%; the UK, U.S.-metal and other reduced rates only as notes. The lists come
          from the HTS (U.S. note 16), checked against CBP&apos;s list.
        </li>
        <li>
          <Ui>Unconfirmed</Ui> headings (for example 9903.82.22, where the source doesn&apos;t say whether
          15% is a total or an added rate, and the China chassis and crane duties due from 10 November
          2026) are named as &ldquo;may apply&rdquo; and never counted until experts confirm them.
        </li>
        <li>
          Not covered (named as warnings): Section 232 on vehicles, trucks, timber, semiconductors,
          pharmaceuticals and drones; Canada&apos;s Section 338 duties; antidumping and countervailing
          duties.
        </li>
      </Bullets>

      <SubHeading>Who maintains duty data</SubHeading>
      <Bullets>
        <li>
          <Ui>Tariff editors</Ui> and admins maintain duty and fee data in <Ui>Tariff Calculator</Ui> →{" "}
          <Ui>Duty data</Ui>: add rows from primary sources, end-date rows, edit legal status and
          sources, and mark programs reviewed. Admins grant or revoke the tariff editor permission in{" "}
          <Ui>Administration</Ui>.
        </li>
        <li>
          Rates are never edited in place: to change one, end-date the row and add a new one from the
          next day. Every change is recorded with who made it, and puts the program back to pending
          review, except an edit of only a row&apos;s source (its citation, links or checked date), which
          changes no rates or scope.
        </li>
        <li>
          Each row&apos;s source shows a link that opens in a new tab and says what it is (a web page, a
          PDF, or a download), the exact citation (heading, U.S. note, HTS revision) so it can be found
          even if a link changes, and, for the China Section 301 and Section 232 rows, a second link to
          download the Chapter 99 PDF with the page to open. USITC only offers that PDF as a download;
          the main link is the HTS website&apos;s page for the heading, which shows the current revision.
        </li>
        <li>
          The China Section 301 and Section 232 lists are extracted from the official sources by
          scripts kept with the code, never typed by hand, and arrive pending review with a cross-check
          report and a spot-check sample for the reviewer.
        </li>
      </Bullets>

      <SubHeading>What an estimate doesn&apos;t include</SubHeading>
      <Bullets>
        {ESTIMATE_CAVEATS.map((caveat) => (
          <li key={caveat}>{caveat}</li>
        ))}
      </Bullets>

      <SubHeading>Estimating duties from Forwarder Sourcing</SubHeading>
      <Steps>
        <li>
          On a forwarder project, <Ui>Estimate duties</Ui>; or on a forwarder&apos;s page, a quote&apos;s{" "}
          <Ui>⋯</Ui> menu → <Ui>Estimate duties for this quote</Ui>. Only the project&apos;s owner or an
          admin sees these.
        </li>
        <li>
          The calculator opens pre-filled from the project (and quote). Every value is a suggestion:
          check each one and tick <Ui>Confirmed</Ui>. Nothing is calculated or saved until every input
          is confirmed.
        </li>
        <li>
          <Ui>Calculate</Ui>, then <Ui>Save to quote</Ui> (or <Ui>Save to project</Ui>). The estimate is
          locked like any other and linked to the project or quote.
        </li>
      </Steps>
      <Bullets>
        <li>
          <Ui>HTS code</Ui>: the project&apos;s HS code, with its official description to check against
          the goods. A warning shows when it has fewer than 10 digits. To use another code, <Ui>Look up
          code</Ui> → <Ui>Use this code</Ui>: it replaces the code in this form only, never the project&apos;s.
        </li>
        <li>
          <Ui>Country of origin</Ui>: filled in only when the project&apos;s origin names exactly one
          country (&ldquo;Vietnam&rdquo;, &ldquo;Shenzhen, China&rdquo;). Anything else
          (&ldquo;Korea&rdquo;, &ldquo;China / Vietnam&rdquo;, &ldquo;Asia&rdquo;) is left for you to pick;
          the calculator never guesses an origin.
        </li>
        <li>
          <Ui>Customs value</Ui>: the project&apos;s invoice value, converted with the latest daily rate
          (shown with its date and source, and locked when saved). If the quote has a cost of goods, you
          can use that instead.
        </li>
        <li>
          When the project&apos;s current incoterm is {DELIVERED_INCOTERMS.join(", ")}, the supplier&apos;s
          price includes international freight, so the calculator asks: <Ui>{DEDUCTION_PROMPT}</Ui>{" "}
          {DEDUCTION_NOTE} The suggested amount is the project&apos;s current freight cost (the freight
          inside today&apos;s invoice, not the new forwarder&apos;s quote); edit it to match the invoice,
          or leave it blank. You must confirm it either way. The estimate shows goods value, deduction and
          the final customs value.
        </li>
        <li>
          <Ui>Shipment mode</Ui>: the quote&apos;s mode (the project&apos;s current mode from the project
          page). HMF applies to Sea only.
        </li>
        <li>
          <Ui>Expected entry date</Ui>: today plus the quote&apos;s longest lead time (for 28–32 days,
          32 days), or today when the quote has none or you opened it from the project. Change it if
          the goods won&apos;t ship today, and confirm it like the other inputs. If the quote&apos;s lead
          time changes later and the date came from it, the estimate shows{" "}
          <Ui>Inputs changed since this estimate</Ui>.
        </li>
        <li>
          <Ui>Quantity</Ui>, for per-unit rates only: the project&apos;s weight for a per-kg rate, or its
          units for a per-each rate. {QUANTITY_HINT}
        </li>
        <li>
          The <Ui>Duty estimates</Ui> card on the project and forwarder pages shows each quote&apos;s
          latest estimate: <Ui>Forwarder quoted duties $X · Our estimate $Y (as of date)</Ui> and the
          difference, or <Ui>Forwarder didn&apos;t quote duties</Ui>. A difference of at least $
          {DUTY_DIFFERENCE_FLAG_USD} and at least {Math.round(DUTY_DIFFERENCE_FLAG_SHARE * 100)}% of the
          higher figure is flagged <Ui>Check with forwarder</Ui>. The estimate&apos;s labels (EXCLUDES,
          pending expert review, last reviewed, {ESTIMATE_DISCLAIMER}) always go with it.
        </li>
        <li>
          If the project or quote values an estimate used change later, it shows{" "}
          <Ui>Inputs changed since this estimate</Ui> with what changed. The estimate stays as saved;
          create a new one to use the new values.
        </li>
        <li>
          Duty estimates never affect ranking, savings or the Quote Comparison numbers, and aren&apos;t
          in Client exports. The Expert CSV has duty estimate columns with its as-of date, entry date and labels.
        </li>
        <li>
          Deleting a project, forwarder or quote also deletes the duty estimates linked to it; the
          delete confirmation says how many.
        </li>
      </Bullets>

      <SubHeading>Saved estimates</SubHeading>
      <Bullets>
        <li>
          A saved estimate is locked with its rates, the day it was calculated, its expected entry
          date, exchange rate and warnings. It never changes; calculate again and save a new one to use newer rates.
        </li>
        <li>Everyone signed in can view saved estimates. The person who saved one, or an admin, can delete it.</li>
      </Bullets>
      <Note>
        HTS data is checked against USITC several times a day. A new release is imported in
        batches and only used once it&apos;s complete; until then, estimates use the previous
        release (named on the page).
      </Note>
    </HelpSection>
  );
}

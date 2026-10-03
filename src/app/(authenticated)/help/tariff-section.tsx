import { ESTIMATE_CAVEATS, ESTIMATE_DISCLAIMER } from "@/lib/tariff/caveats";
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
          <Ui>MPF</Ui> (Merchandise Processing Fee): the percentage in force today, between its
          minimum and maximum, as if this line were the whole entry. Values up to the
          informal-entry limit pay the flat informal fee instead.
        </li>
        <li>
          <Ui>HMF</Ui> (Harbor Maintenance Fee): ocean shipments only.
        </li>
        <li>Each line is rounded once, half up to the cent.</li>
        <li>
          Every line shows its rate, its source and the date it came into effect; the estimate
          shows the date the rates were taken.
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
          review.
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

      <SubHeading>Saved estimates</SubHeading>
      <Bullets>
        <li>
          A saved estimate is locked with its rates, dates, exchange rate and warnings. It never
          changes; calculate again and save a new one to use newer rates.
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

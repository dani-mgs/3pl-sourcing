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
      <p>
        Section 301, Section 232, Section 338 and other additional duties aren&apos;t calculated
        yet. When one may apply to the origin or HTS code you entered, the total is labelled{" "}
        <Ui>Base duty + fees — EXCLUDES N additional duty program(s) that may apply</Ui>, and
        each program is named right under it. Where a program adds a single flat percentage for
        that origin (for example the forced-labour Section 301 rate for Vietnam), it shows a
        rough &ldquo;could add up to X%&rdquo;; otherwise the program is only named. The same
        label appears on saved estimates and in the saved list.
      </p>

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

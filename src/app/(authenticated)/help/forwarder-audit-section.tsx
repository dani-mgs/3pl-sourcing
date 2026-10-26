import { MAX_FINDINGS_SHOWN, MAX_LINES, V1_SETTINGS } from "@/lib/forwarder-audit/lists";
import { Bullets, HelpSection, Note, Steps, SubHeading, Ui } from "./help-parts";

// Forwarder Audit: workflow and rules. Shown only while
// FORWARDER_AUDIT_ENABLED is on (page.tsx). Mirrors src/lib/forwarder-audit
// (the frozen v1.0 workbook rules); the limits and settings come from the
// code. Keep in step (AGENTS.md).

export function ForwarderAuditSection() {
  return (
    <HelpSection id="forwarder-audit" title="Forwarder Audit">
      <p>
        Checks one freight quotation, line by line, against the commercial invoice (CI), the packing list (PL) and any rate agreement. It
        finds arithmetic errors, rates above an agreed rate, quoted cargo that contradicts the documents, duplicated or unexplained
        charges, services the client asked for that aren&apos;t priced, charges the other party normally pays under the Incoterm, and
        rates that are expiring. It follows version 1.0 of the Forwarder Audit workbook, rule for rule.
      </p>

      <SubHeading>Workflow</SubHeading>
      <Steps>
        <li>
          Collect the forwarder&apos;s quotation, the CI, the PL and any rate agreement. Without an itemised quotation, the CI or the PL
          the status is <Ui>Insufficient Information</Ui>.
        </li>
        <li>
          <Ui>Forwarder Audit</Ui> → <Ui>New audit</Ui>. In section 1, copy the cargo from the CI and PL (pieces, cartons and pallets
          separately, weight, volume, value) and answer <Ui>PL volume covers all cargo?</Ui>. Record the Incoterm exactly as on the CI
          and the client&apos;s role (buyer or seller).
        </li>
        <li>
          Section 2: the forwarder, date, freight validity and, only if the quotation states them, the origin and destination charge
          validity (blank means Not Confirmed), currency, mode and containers, route, transit time and free time. Enter the cargo figures
          only if the quotation states them. In section 3, answer <Ui>Requested by client?</Ui> for each service. Section 4: one row per
          quoted charge (Charge, Category, Basis, Rate, Status). Leave Currency blank for the quotation currency. Enter the
          forwarder&apos;s line total only if the quotation shows it, and the agreed rate only if a rate agreement was provided.
        </li>
        <li>
          Read section 5. It updates as you type; <Ui>Save audit</Ui> keeps your inputs. Use <Ui>Reviewer flag</Ui> on a line for your own
          judgement (for example a possible duplicate); it becomes a finding. Accept a weight or volume difference with{" "}
          <Ui>Accept diff.? = Yes</Ui>.
        </li>
        <li>
          <Ui>Summary (print)</Ui> opens the Summary page for the last saved version; use <Ui>Print / save as PDF</Ui>.
        </li>
      </Steps>
      <Note>
        Any staff member can open an audit; only its owner or an admin can change or delete it. Nothing calculated is stored: the status
        and findings are worked out again from your inputs every time. One quotation per audit.
      </Note>

      <SubHeading>Status</SubHeading>
      <Bullets>
        <li>
          <Ui>Insufficient Information</Ui>: the CI or PL is missing, the quotation isn&apos;t itemised, or no line can be calculated.
          (Answers left blank don&apos;t count as No.)
        </li>
        <li>
          <Ui>Corrections Required</Ui>: at least one confirmed error: a line amount or stated total that doesn&apos;t reconcile, a rate
          above the agreed rate, or quoted pieces or packages that contradict the CI/PL.
        </li>
        <li>
          <Ui>Needs Clarification</Ui>: no confirmed errors, but open questions or risks (for example unpriced or excluded requested
          services, at-cost items, expiring rates).
        </li>
        <li>
          <Ui>Audit Complete — No Issues Identified</Ui>: only when no error, question or risk is open. It can&apos;t appear while
          requested services are unpriced, excluded or estimated.
        </li>
      </Bullets>

      <SubHeading>Finding types</SubHeading>
      <Bullets>
        <li>
          <Ui>Error</Ui>: confirmed; the forwarder must correct it.
        </li>
        <li>
          <Ui>Question</Ui>: to be clarified before the client proceeds. Its amount is &quot;under question&quot;, not a confirmed
          saving.
        </li>
        <li>
          <Ui>Risk</Ui>: the cost could change or isn&apos;t covered by the quotation.
        </li>
      </Bullets>
      <p>
        Findings are listed most important first (errors, then questions, then risks), up to {MAX_FINDINGS_SHOWN}. A question&apos;s
        amount can appear in more than one finding, so <Ui>Under question</Ui> is a pointer, not a total to add up.
      </p>

      <SubHeading>Reading the lines</SubHeading>
      <Bullets>
        <li>
          Statuses: <Ui>Firm</Ui> counts in the firm figure; <Ui>Estimate</Ui> is shown separately; <Ui>If required</Ui> is conditional;{" "}
          <Ui>At cost</Ui> and <Ui>TBC</Ui> have no amount; <Ui>Included</Ui>, <Ui>Excluded</Ui> and <Ui>Not applicable</Ui> have none
          either.
        </li>
        <li>
          <Ui>Verified</Ui> appears only when the forwarder&apos;s own line total is entered and reconciles (within{" "}
          {V1_SETTINGS.roundingTolerance.toFixed(2)}). Otherwise a line shows <Ui>Calculated — Not Independently Verified</Ui>.
        </li>
        <li>
          Quantities fill in from the basis: per container is the containers quoted; per CBM the shipped CBM; per RT the greater of CBM
          and tonnes; per kg the chargeable kg (air uses the stated divisor, else{" "}
          {V1_SETTINGS.airDivisor.toLocaleString("en-US")} cm³/kg). Use <Ui>Qty / base override</Ui> for per-unit lines and for the base
          of a percentage charge. A per-unit line without a quantity counts 1.
        </li>
        <li>
          Incoterm questions are raised only for services that Incoterms 2020 normally places on the other party. They are questions,
          not errors.
        </li>
        <li>
          A rate expiring within {V1_SETTINGS.validityWarningDays} days of the audit date is a Risk; one that has expired for the audit
          or cargo ready date is a Question.
        </li>
      </Bullets>

      <SubHeading>What it never judges</SubHeading>
      <p>
        It doesn&apos;t say whether a price is high or low against the market (no benchmark is used), and it holds no duty or VAT rates:
        have a licensed customs broker confirm the HS code, duties and taxes. Agreed rates are checked only when you enter them from a
        rate agreement.
      </p>

      <SubHeading>Limits</SubHeading>
      <p>
        Up to {MAX_LINES} charge lines and {MAX_FINDINGS_SHOWN} findings are shown. There is no upload of the Excel workbook and no locked
        versions: the Summary always shows the last saved inputs.
      </p>
    </HelpSection>
  );
}

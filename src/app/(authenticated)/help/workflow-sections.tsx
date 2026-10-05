import { HUB_MODULES } from "@/lib/modules";
import { Bullets, HelpSection, Note, Steps, SubHeading, Ui } from "./help-parts";

// Sections 1–3: what the hub is for and the two module workflows. Every rule
// here mirrors the code; see AGENTS.md ("update /help in the same change").

export function OverviewSection() {
  return (
    <HelpSection id="overview" title="What the Decision Hub is for">
      <p>
        One place for MOVE&apos;s sourcing work: capture a client&apos;s requirements, compare
        providers&apos; costs side by side against what the client pays today, and turn that
        into a recommendation or a report for the client.
      </p>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {HUB_MODULES.map((module) => (
          <li
            key={module.name}
            className="flex flex-col gap-0.5 rounded-xl border border-neutral-border px-3 py-2"
          >
            <span className="flex items-center gap-2 font-medium">
              {module.name}
              {module.href ? (
                <span className="rounded-full bg-[#DCFCE7] px-1.5 py-0.5 text-[10px] leading-none font-semibold text-[#15803D] uppercase">
                  Live
                </span>
              ) : (
                <span className="rounded-full bg-[#FBBF24] px-1.5 py-0.5 text-[10px] leading-none font-semibold text-move-navy uppercase">
                  Soon
                </span>
              )}
            </span>
            <span className="text-xs text-neutral-muted">{module.description}</span>
          </li>
        ))}
      </ul>
    </HelpSection>
  );
}

export function ThreePlSection() {
  return (
    <HelpSection id="three-pl" title="3PL Sourcing workflow">
      <Steps>
        <li>
          <Ui>3PL Sourcing</Ui> → <Ui>New Project</Ui>. Choose <Ui>Upload a Document</Ui> (a
          discovery-call transcript or notes pre-fills the intake) or{" "}
          <Ui>Start from Scratch</Ui>.
        </li>
        <li>
          Work through the three steps: <Ui>Project Info</Ui> (client and requirements) →{" "}
          <Ui>Add 3PLs</Ui> → <Ui>Verify Details</Ui>.
        </li>
        <li>
          Open each 3PL to fill in capabilities, the nine cost fields, and{" "}
          <Ui>Rate Details</Ui> (13 rates and fees, saved with the 3PL). A 3PL can also be
          added or updated from a document.
        </li>
        <li>
          Tick <Ui>Incumbent</Ui> on the 3PL the client uses today (one per project). It
          becomes the baseline for savings.
        </li>
        <li>
          Read the <Ui>Cost Comparison</Ui> on the project page.
        </li>
        <li>
          Record the recommendation on the project&apos;s Recommendation page.
        </li>
      </Steps>

      <SubHeading>How the Cost Comparison works</SubHeading>
      <Bullets>
        <li>
          Total cost is the sum of the nine cost fields. A blank field counts as 0, but a 3PL
          with all nine blank has no total and isn&apos;t ranked.
        </li>
        <li>Rank 1 is the cheapest total. 3PLs with equal totals get consecutive ranks.</li>
        <li>
          Savings compare each 3PL with the incumbent. The baseline shows N/A when no 3PL is
          marked Incumbent, and Pending when the incumbent has no costs yet.
        </li>
        <li>
          If the costed 3PLs aren&apos;t all in one currency, nothing is ranked and savings
          show Currency Mismatch. Costs are never converted.
        </li>
      </Bullets>

      <SubHeading>Recommendation</SubHeading>
      <Bullets>
        <li>Only 3PLs with status Vetted are considered.</li>
        <li>
          Pick a priority: Cost Savings, Quality of Service, or Turnaround Time. With Cost
          Savings the Vetted 3PLs are ordered by total cost; with the other two they&apos;re
          listed in the order they were added. The first three are saved as the top three.
        </li>
      </Bullets>
      <Note>
        There&apos;s no button for the Recommendation page yet: add{" "}
        <code className="rounded bg-neutral-bg px-1">/recommendation</code> to the 3PL
        project&apos;s address.
      </Note>
    </HelpSection>
  );
}

export function ForwarderSection() {
  return (
    <HelpSection id="forwarder" title="Forwarder Sourcing workflow">
      <Steps>
        <li>
          <Ui>Forwarder Sourcing</Ui> → <Ui>New Project</Ui>, from a document or from scratch.
          Fill in the route, cargo, current shipping (the baseline), volume, final terms, and
          customs.
        </li>
        <li>
          <Ui>Add Forwarder</Ui> for each forwarder you&apos;re approaching, with its
          capabilities, status, and assessment.
        </li>
        <li>
          Open a forwarder → <Ui>Add Quote</Ui>. Give every quote a scenario group, its
          incoterm, mode and type, weights, currency, amount, and exchange rate.
        </li>
        <li>
          Compare on the project page: summary tiles, then <Ui>Quote Comparison</Ui> with one
          tab per scenario group. Each forwarder&apos;s own page shows its position and
          requirement fit.
        </li>
        <li>
          Optionally, <Ui>Estimate duties</Ui> for the project or a quote, to compare with the duties
          the forwarder quoted (see Tariff Calculator).
        </li>
        <li>
          <Ui>Export</Ui> a Client or Expert version as CSV, PDF, or DOCX.
        </li>
      </Steps>
      <Bullets>
        <li>Deleting a forwarder also deletes all of its quotes, and their duty estimates.</li>
        <li>A project can&apos;t be deleted while it still has forwarders.</li>
        <li>A shipment type must go with its mode (e.g. FCL and LCL are Sea types).</li>
      </Bullets>
    </HelpSection>
  );
}

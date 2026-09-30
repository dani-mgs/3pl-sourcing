import { Bullets, HelpSection, Note, SubHeading, Ui } from "./help-parts";

// Sections 4–7. Sources: src/lib/forwarder/cost-comparison.ts,
// project-summary.ts, requirement-fit.ts, report-data.ts, parse-quote-form.ts,
// the merge-*-fields.ts helpers, get-ownership-context.ts, and the RLS
// policies. Update this file in the same change as any of those.

export function ConceptsSection() {
  return (
    <HelpSection id="concepts" title="Key concepts: Forwarder Sourcing">
      <SubHeading>Current terms vs final terms</SubHeading>
      <Bullets>
        <li>
          <Ui>Current</Ui> incoterm, mode, and type (with the current freight cost) are the
          baseline: a quote only gets a vs Baseline saving if it matches all three.
        </li>
        <li>
          <Ui>Final</Ui> incoterm, mode, and type are what quotes are ranked on: a quote is
          only ranked if it matches all three. Nothing is ranked until all three are set.
        </li>
        <li>
          So a quote can be ranked while its vs Baseline says Not Comparable, when the final
          terms differ from the current ones.
        </li>
        <li>
          Ranking and savings use freight cost only (amount × exchange rate, in USD), not
          duties or other charges.
        </li>
        <li>
          Annual figures use shipments per year, or shipments per month × 12 if per year is
          blank.
        </li>
        <li>Cost per kg uses chargeable weight for Air when it&apos;s set, actual weight otherwise.</li>
      </Bullets>

      <SubHeading>Scenario groups</SubHeading>
      <Bullets>
        <li>Quotes are only ranked against quotes in the same scenario group.</li>
        <li>
          The group name must match exactly, including capitals (spaces at either end are
          trimmed). &ldquo;HCM-LGB-LCL&rdquo; and &ldquo;hcm-lgb-lcl&rdquo; are two groups. Pick
          an existing name from the suggestions as you type.
        </li>
      </Bullets>

      <SubHeading>Rank labels</SubHeading>
      <Bullets>
        <li>
          <Ui>Not Comparable</Ui>: the quote&apos;s incoterm, mode, or type doesn&apos;t match
          the project&apos;s final terms, or its completeness is &ldquo;Incomplete / Needs
          Clarification&rdquo;.
        </li>
        <li>
          <Ui>Excluded from ranking</Ui>: the forwarder&apos;s status is Unfit, Do Not Contact,
          or Withdrawn / No Response. Its quotes still show, with vs Baseline, but aren&apos;t
          ranked.
        </li>
        <li>
          <Ui>Lowest Freight Cost</Ui> goes to every quote tied for cheapest (costs compared to
          the cent); <Ui>Highest Freight Cost</Ui> likewise. A group with one ranked quote
          says <Ui>Only Comparable Quote</Ui>; ranks in between show &ldquo;—&rdquo; and
          &ldquo;#2 of 3&rdquo;.
        </li>
        <li>
          The <Ui>Best quote</Ui> tile is the cheapest ranked quote across all scenario groups,
          with &ldquo;1 of N scenarios&rdquo; when more than one group has ranked quotes.
        </li>
      </Bullets>

      <SubHeading>Requirement fit (forwarder page)</SubHeading>
      <Bullets>
        <li>
          Built only from the project&apos;s structured fields: final mode and type (current
          ones if the final mode isn&apos;t set) → Air, Sea, or Road Freight and FCL, LCL, or
          Courier / Express; brokerage &ldquo;Yes&rdquo; → Customs Brokerage; insurance
          &ldquo;Yes&rdquo; or &ldquo;Quote Both With and Without&rdquo; → Cargo Insurance.
        </li>
        <li>Coverage fields are free text and aren&apos;t checked against the route.</li>
        <li>
          An unticked capability means &ldquo;not yet confirmed&rdquo;, not &ldquo;no&rdquo;, so
          fit says <Ui>Not confirmed</Ui>. Tick it on the forwarder once it&apos;s confirmed.
        </li>
      </Bullets>

      <SubHeading>Lead time and rate validity</SubHeading>
      <Bullets>
        <li>
          An orange dot means the slowest stated lead time (the max, or the min if there&apos;s
          no max) is over the project&apos;s target lead time.
        </li>
        <li>
          <Ui>Expired</Ui> once the valid-until date has passed; <Ui>Expires in N d</Ui> (or{" "}
          <Ui>Expires today</Ui>) within 7 days of it. Dates are compared in UTC.
        </li>
      </Bullets>
    </HelpSection>
  );
}

export function UploadSection() {
  return (
    <HelpSection id="upload" title="AI document upload">
      <Bullets>
        <li>
          <Ui>Upload a Document</Ui> (.txt, .pdf, or .docx) to fill a new record, or on an edit
          form to update one. Works for 3PL projects and 3PLs, and forwarder projects,
          forwarders, and quotes.
        </li>
        <li>
          Everything it fills is a pre-fill: review it, then save. Nothing is saved until you
          do.
        </li>
        <li>
          On an edit form, only fields the document clearly states are changed, and each one
          is marked <Ui>Updated</Ui>. Anything it doesn&apos;t mention keeps its value.
        </li>
        <li>
          Never filled from a document: status, assessment, next action, key notes, the 3PL
          Incumbent flag, a quote&apos;s completeness, overall assessment, and client decision,
          or an existing record&apos;s company or client name.
        </li>
        <li>
          3PL capabilities can only be switched on by a document. Forwarder capabilities can be
          switched on or off, but only when the document says so explicitly.
        </li>
        <li>
          From a 3PL document it fills four of the nine costs (storage, pick &amp; pack,
          receiving, returns) and no Rate Details.
        </li>
      </Bullets>

      <SubHeading>Exchange rates are never guessed</SubHeading>
      <Bullets>
        <li>A USD quote&apos;s rate is always 1.</li>
        <li>
          Any other currency needs a rate you enter or the document states. If the document
          doesn&apos;t state one, or you change the currency yourself, the rate is left blank
          and the quote can&apos;t be saved until you fill it in.
        </li>
      </Bullets>
    </HelpSection>
  );
}

export function ExportSection() {
  return (
    <HelpSection id="exports" title="Exports: Client vs Expert">
      <p>
        Both come as CSV, PDF, or DOCX, with three parts: project details, forwarders
        considered, and the quote comparison. The Expert version has everything. The Client
        version leaves out:
      </p>
      <Bullets>
        <li>Project: Project Status.</li>
        <li>
          Forwarders: Contact Person, Contact Position, Email, Phone, Status, Assessment, Next
          Action, and Key Notes.
        </li>
        <li>
          Quotes: Forwarder Status, Key Strength, Key Weakness / Risk, Important Assumption,
          Overall Assessment, Client Decision, and Notes.
        </li>
        <li>
          Every quote from an excluded forwarder (Unfit, Do Not Contact, Withdrawn / No
          Response). The forwarder itself is still listed under forwarders considered.
        </li>
      </Bullets>
      <Note>
        In exports, capabilities read Yes / No, where No means &ldquo;not yet confirmed&rdquo;.
      </Note>
    </HelpSection>
  );
}

export function PermissionsSection() {
  return (
    <HelpSection id="permissions" title="Permissions">
      <Bullets>
        <li>
          Everyone signed in can open every project, and export any Forwarder Sourcing project.
        </li>
        <li>
          <Ui>Owner</Ui> (whoever created the project, unless an admin reassigns it): can edit it and add, edit, or delete
          its 3PLs, forwarders, and quotes, and delete the project.
        </li>
        <li>
          <Ui>Admin</Ui>: can do everything an owner can on every project, plus{" "}
          <Ui>Administration</Ui> in the account menu: manage users, reassign a project&apos;s
          owner, and edit or delete shared client records (a client&apos;s name and business
          model can only be changed there).
        </li>
        <li>
          <Ui>View only</Ui>: on anyone else&apos;s project you&apos;ll see &ldquo;Owned by
          … — view only&rdquo; and no edit, add, or delete controls.
        </li>
      </Bullets>
    </HelpSection>
  );
}

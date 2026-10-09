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
          duties or other charges. Duty estimates from the Tariff Calculator are shown beside quotes
          but never change rank or savings.
        </li>
        <li>
          <Ui>Freight cost ratio</Ui> (summary tile and Quote Comparison column) is a
          quote&apos;s freight cost in USD divided by the project&apos;s invoice value, to one
          decimal; the tile shows current → best quote. Freight only, no duties or other
          charges, and blank unless the invoice value is above zero and in USD. Quotes with
          different terms show it too.
        </li>
        <li>
          Annual figures (on a forwarder&apos;s page, and in the Expert export) use shipments
          per year, or shipments per month × 12 if per year is blank.
        </li>
        <li>Cost per kg uses chargeable weight for Air when it&apos;s set, actual weight otherwise.</li>
      </Bullets>

      <SubHeading>Which quotes are ranked together</SubHeading>
      <Bullets>
        <li>
          All of a project&apos;s quotes that match its final terms are ranked together,
          whatever forwarder they come from. There is nothing to type to group them.
        </li>
        <li>
          Quotes with different terms (for example DDU when the final terms are DDP) are still
          shown, in the same table, but below the ranked ones: greyed out, with the rank{" "}
          <Ui>Different terms</Ui>. They never take part in ranking or the Best quote.
        </li>
        <li>
          Each quote is named by its terms, such as &ldquo;DDP · Sea · FCL&rdquo;, with its
          origin → destination underneath when it has one. Check the route: quotes for different
          lanes would still be ranked against each other if their terms match.
        </li>
        <li>
          Quotes saved before this change keep their old scenario group text. It shows as{" "}
          <Ui>Legacy scenario</Ui> in the quote&apos;s expanded details and, in the Expert CSV, as
          Legacy Scenario Group. It no longer affects ranking.
        </li>
      </Bullets>

      <SubHeading>Rank labels</SubHeading>
      <Bullets>
        <li>
          <Ui>Different terms</Ui>: the quote states an incoterm, mode, and type, and they
          don&apos;t all match the project&apos;s final terms. Exports call this{" "}
          <Ui>Not Comparable</Ui>.
        </li>
        <li>
          <Ui>Not Comparable</Ui>: the final terms aren&apos;t all set, the quote is missing
          one of its own terms, or its completeness is &ldquo;Incomplete / Needs
          Clarification&rdquo;.
        </li>
        <li>
          <Ui>Excluded from ranking</Ui>: the forwarder&apos;s status is Unfit, Do Not Contact,
          or Withdrawn / No Response. Its quotes still show, with vs Baseline, but aren&apos;t
          ranked.
        </li>
        <li>
          <Ui>Lowest Freight Cost</Ui> goes to every quote tied for cheapest (costs compared to
          the cent); <Ui>Highest Freight Cost</Ui> likewise. When only one quote in the project
          is ranked it says <Ui>Only Comparable Quote</Ui>; ranks in between show &ldquo;—&rdquo; and
          &ldquo;#2 of 3&rdquo;.
        </li>
        <li>
          The <Ui>Best quote</Ui> tile is the cheapest ranked quote in the project. It shows the
          quote&apos;s terms and route, so you can see at a glance what was compared.
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
          Filler such as &ldquo;N/A&rdquo;, &ldquo;Unknown&rdquo;, or &ldquo;Not specified&rdquo;
          is ignored, and a document never blanks out a field that already has a value.
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

      <SubHeading>Exchange rates: locked per quote, never guessed</SubHeading>
      <Bullets>
        <li>A USD quote&apos;s rate is always 1 and needs no source or date.</li>
        <li>
          Any other currency starts from, in order: a rate stated in the uploaded document
          (<Ui>Forwarder&apos;s quoted rate</Ui>), else the latest daily rate (
          <Ui>Daily reference rate</Ui>, from Frankfurter&apos;s blended central-bank rates,
          updated once a day), else blank for you to enter (<Ui>Entered manually</Ui>). It&apos;s
          never 1 and never guessed; if there&apos;s no rate the quote can&apos;t be saved.
        </li>
        <li>
          The caption under the rate says where it came from and its date. Typing over a
          pre-filled rate makes it <Ui>Entered manually</Ui>; <Ui>Refresh to latest rate</Ui>{" "}
          switches back to the latest daily rate.
        </li>
        <li>
          The rate is locked when you save: the quote&apos;s USD figures never change when
          newer daily rates arrive. Wherever a converted USD amount appears, a short
          &ldquo;rate locked Oct 1, 2026&rdquo; note shows which rate was used.
        </li>
        <li>
          If the daily rate is more than 3 business days old (the feed may be behind), the
          form warns you to check it. Weekend and holiday dates show the last business day.
        </li>
        <li>
          Quotes entered before rates were tracked say{" "}
          <Ui>Entered manually (date not recorded)</Ui>. Editing other fields keeps their rate.
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
          Quotes: Annual Savings, Legacy Scenario Group (old quotes only), Forwarder Status, Key Strength, Key Weakness / Risk, Important Assumption,
          Overall Assessment, Client Decision, and Notes.
        </li>
        <li>Duty estimates: only the Expert CSV has them (not the Expert PDF or DOCX yet).</li>
        <li>
          Excluded forwarders (Unfit, Do Not Contact, Withdrawn / No Response) entirely: they
          aren&apos;t listed under forwarders considered, and none of their quotes appear. The
          Client version shows finalists only.
        </li>
      </Bullets>
      <p>
        Both versions show each non-USD quote&apos;s Exchange Rate, Rate Date, and Rate Source
        (Daily reference rate, Forwarder&apos;s quoted rate, Entered manually, or Entered
        manually (date not recorded)), with a source note at the end when daily rates are used.
      </p>
      <Note>
        In exports, each capability reads Yes or Not confirmed, as in the app. Not confirmed
        means nobody has confirmed it yet, not that the forwarder can&apos;t do it.
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
          <Ui>Tariff Calculator</Ui>: everyone signed in can calculate, save, and view saved
          estimates. Only whoever saved an estimate, or an admin, can delete it; nobody can
          change one. Estimates linked to a forwarder project or quote can only be created by the
          project&apos;s owner or an admin. Duty and fee data can only be changed by <Ui>tariff editors</Ui> and admins;
          admins grant the tariff editor permission in Administration.
        </li>
        <li>
          When an admin changes someone&apos;s role or tariff editor permission, it applies from
          that person&apos;s next page load or save. They don&apos;t need to sign out and back in.
        </li>
        <li>
          <Ui>View only</Ui>: on anyone else&apos;s project you&apos;ll see &ldquo;Owned by
          … — view only&rdquo; and no edit, add, or delete controls.
        </li>
      </Bullets>
    </HelpSection>
  );
}

import { MAX_EDITOR_COSTS, MAX_EDITOR_SKUS } from "@/lib/landed-cost/editor-draft";
import { MAX_ORIGINS } from "@/lib/landed-cost/origin-draft";
import { PASTE_FIELD_LABELS } from "@/lib/landed-cost/parse-sku-paste";
import { SUPPORTED_INCOTERMS } from "@/lib/landed-cost/scenario-totals";
import { AIR_CARGO_DIVISOR, COURIER_DIVISOR, SEA_KG_PER_CBM } from "@/lib/landed-cost/shipment-measures";
import { INCOMPLETE_ESTIMATE_LABEL } from "@/lib/tariff/programs";
import { Bullets, HelpSection, Note, Steps, SubHeading, Ui } from "./help-parts";

// Landed Cost: workflow and rules. Shown only while LANDED_COST_ENABLED is on
// (page.tsx). Mirrors src/lib/landed-cost; the limits and defaults come from
// the code. Keep in step (AGENTS.md).

const n = (value: number) => value.toLocaleString("en-US");
const incoterms = `${SUPPORTED_INCOTERMS.slice(0, -1).join(", ")} and ${SUPPORTED_INCOTERMS.at(-1)}`;

export function LandedCostSection() {
  return (
    <HelpSection id="landed-cost" title="Landed Cost">
      <p>
        Works out what one shipment costs once it has landed in the US, per unit and for the whole
        shipment: product, freight, duties, MPF, HMF and any other costs. Cost the same SKUs from
        one or more origins (a country and supplier) and compare them side by side.
      </p>

      <SubHeading>Workflow</SubHeading>
      <Steps>
        <li>
          <Ui>Landed Cost</Ui> → <Ui>New workspace</Ui>: a name, the expected entry date and the
          first origin, then <Ui>Create workspace</Ui>.
        </li>
        <li>
          Add the SKUs (code, description, HTS code, quantity) in the table, or use{" "}
          <Ui>Paste from Excel</Ui>.
        </li>
        <li>
          For each origin, fill in the mode, incoterm and entry type, each SKU&apos;s FOB price
          and packing (pieces per carton, carton size and weight), the <Ui>Freight total</Ui> and
          how to split it, and any other costs.
        </li>
        <li>
          <Ui>Save draft</Ui>. The result appears beside the inputs.
        </li>
        <li>
          Add origins with <Ui>Duplicate this origin</Ui> (copies everything except the FOB
          prices and the freight total) or <Ui>Add blank origin</Ui>, and save again.
        </li>
        <li>
          With two or more origins, read <Ui>Compare origins</Ui>.
        </li>
        <li>
          <Ui>Lock this version</Ui> to keep the result as it is today, then{" "}
          <Ui>Download PDF</Ui> or <Ui>Export CSV</Ui> from the version.
        </li>
      </Steps>
      <Note>
        Any staff member can open a workspace; only its owner or an admin can change it.
      </Note>

      <SubHeading>How it&apos;s calculated</SubHeading>
      <Bullets>
        <li>
          <strong>Customs value</strong> per SKU = quantity × FOB price per unit.
        </li>
        <li>
          <strong>Duties</strong> come from the same data as the Tariff Calculator: the HTS rate
          plus any additional duty programs for the origin, in force on the entry date.
        </li>
        <li>
          <strong>MPF and HMF are charged once per origin</strong>, for that origin&apos;s whole
          entry, and shared across its SKUs by customs value. The Tariff Calculator works
          differently: it treats each line as its own entry.
        </li>
        <li>
          <strong>Entry type</strong>: <Ui>Automatic</Ui> uses an informal entry (a flat MPF)
          when the customs value is within the informal-entry limit, and formal above it.{" "}
          <Ui>Formal</Ui> is always formal, as when a broker files a formal entry.
        </li>
        <li>
          <strong>HMF</strong> applies to sea shipments only.
        </li>
        <li>
          <strong>Freight</strong> is split across SKUs by <Ui>Chargeable weight</Ui>,{" "}
          <Ui>Value (FOB)</Ui> or <Ui>Units</Ui>. Chargeable weight is the greater of the
          actual and the volumetric weight.
        </li>
        <li>
          <strong>Cartons</strong> are rounded up: a part-filled last carton counts as a full
          one for weight and volume.
        </li>
        <li>
          <strong>Other costs</strong> (inspection, insurance, inland trucking…) are added to the
          landed cost but are not part of the customs value, so no duty is charged on them.
        </li>
      </Bullets>

      <SubHeading>Defaults you can change</SubHeading>
      <p>
        These are the current defaults. Each origin can change them.
      </p>
      <Bullets>
        <li>
          <Ui>Volumetric divisor</Ui>: Air {n(AIR_CARGO_DIVISOR)} cm³/kg (for courier, often{" "}
          {n(COURIER_DIVISOR)}: enter it for that origin); Sea 1 CBM = {n(SEA_KG_PER_CBM)} kg;
          Road has no default, so the actual weight is used. Leave the field blank to use the
          default.
        </li>
        <li>
          <Ui>Entry type</Ui>: <Ui>Automatic</Ui>, or choose <Ui>Formal</Ui>.
        </li>
      </Bullets>

      <SubHeading>Reading the result</SubHeading>
      <Bullets>
        <li>
          There is no total until every SKU has what the calculation needs. Until then the
          result says <Ui>Incomplete: no total yet</Ui> and lists what&apos;s missing; select an
          item to go to its field.
        </li>
        <li>
          <Ui>{INCOMPLETE_ESTIMATE_LABEL}</Ui> means a total is shown, but some duties or fees
          aren&apos;t final: for example, a duty program is still pending review, or a
          program&apos;s data isn&apos;t loaded yet. The reasons are listed.
        </li>
        <li>
          Each SKU&apos;s duty layers show when the rates were last verified.
        </li>
        <li>Percentages are rounded, so they may not add up to exactly 100%.</li>
      </Bullets>

      <SubHeading>Comparing origins</SubHeading>
      <p>
        One origin is the baseline (the first, until you choose another with{" "}
        <Ui>Set as baseline</Ui>); every other origin is compared with it, on landed cost per unit.
      </p>
      <Bullets>
        <li>
          The verdict reads like &ldquo;China is $2.34/unit cheaper than Vietnam (11.9%)&rdquo;:
          the percentage is of the more expensive origin&apos;s cost.
        </li>
        <li>
          <Ui>Ranking</Ui> lists the origins from lowest to highest landed cost, each with its
          difference from the baseline.
        </li>
        <li>
          The per-SKU table marks the <Ui>Lowest</Ui> origin for each SKU.
        </li>
        <li>
          <Ui>What drives the difference, against the baseline</Ui> splits each difference into
          product, freight, duties, fees and other costs.
        </li>
        <li>
          <Ui>Not comparable with the baseline</Ui>: an origin on a different incoterm from the
          baseline shows its own totals, with the reason, but isn&apos;t ranked. A different
          shipment mode is allowed and noted.
        </li>
        <li>
          <Ui>Ranking may change</Ui>: some origins&apos; duties or fees aren&apos;t final yet,
          so the order could move once they are.
        </li>
      </Bullets>

      <SubHeading>Drafts and locked versions</SubHeading>
      <Bullets>
        <li>
          A draft&apos;s result is recalculated from its last save with the current duty data, so
          it can change when duty data is updated.
        </li>
        <li>
          <Ui>Lock this version</Ui> (once every origin is complete) keeps the result as
          calculated that day, numbered v1, v2, and so on. A locked version never changes, and a
          number is never reused, even after a version is deleted.
        </li>
        <li>
          A version can be deleted by whoever locked it, the workspace&apos;s owner or an admin.
          A workspace with locked versions can&apos;t be deleted until its versions are.
        </li>
        <li>
          Exports: a draft exports as CSV (marked as a draft). A locked version exports as PDF
          or CSV, built from what was stored.
        </li>
      </Bullets>

      <SubHeading>Paste from Excel</SubHeading>
      <Bullets>
        <li>
          Copy the rows from your spreadsheet, headings included, and paste them. You see a
          preview before anything changes.
        </li>
        <li>
          Imported columns: {Object.values(PASTE_FIELD_LABELS).join(", ")}. The FOB price and
          packing go to the origin you&apos;ve selected.
        </li>
        <li>
          Rows match existing SKUs by code: matches are updated, new codes are added, and nothing
          is deleted. A blank cell keeps the current value.
        </li>
        <li>
          Rate, fee, freight, total and landed-cost columns are ignored on purpose: these are
          calculated here. The preview lists every ignored column and why.
        </li>
        <li>
          Remove the country from SKU codes (&ldquo;MUG-01&rdquo;, not &ldquo;MUG-01-CN&rdquo;)
          so the same SKU matches across origins. The preview warns you when a code seems to
          include one.
        </li>
      </Bullets>

      <SubHeading>Limits and not yet available</SubHeading>
      <Bullets>
        <li>
          Up to {MAX_EDITOR_SKUS} SKUs and {MAX_ORIGINS} origins per workspace, and{" "}
          {MAX_EDITOR_COSTS} other costs per origin.
        </li>
        <li>Amounts are in USD only.</li>
        <li>
          Incoterms {incoterms} only: their prices don&apos;t include international freight.
        </li>
        <li>
          Not available yet: manual rate overrides, delivered incoterms (such as CIF or DDP),
          linking a forwarder quote, and non-Latin text in PDFs (such characters show as
          &ldquo;?&rdquo;).
        </li>
      </Bullets>

      <Note>Estimate for planning only. Rates and fees can change. Not customs or legal advice.</Note>
    </HelpSection>
  );
}

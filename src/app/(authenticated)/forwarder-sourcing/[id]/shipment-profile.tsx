import { PROJECT_SECTIONS, type ProjectField } from "@/lib/forwarder/project-sections";
import { formatProjectValue } from "@/lib/forwarder/project-display";
import { CollapsibleProfile } from "./collapsible-profile";

type Row = Record<string, unknown>;

const FIELDS = new Map<string, ProjectField>(
  PROJECT_SECTIONS.flatMap((section) => section.fields.map((f) => [f.name, f] as const)),
);

// Formatted exactly as the rest of the app shows it; null when empty so the
// row can be hidden instead of showing "—".
function value(row: Row, name: string): string | null {
  const field = FIELDS.get(name);
  if (!field) return null;
  const text = formatProjectValue(field, row);
  return text === "—" ? null : text;
}

function joined(parts: (string | null)[], separator = " · "): string | null {
  const filled = parts.filter((p): p is string => p != null);
  return filled.length ? filled.join(separator) : null;
}

export function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-neutral-border pt-3 first:border-t-0 first:pt-0">
      <h3 className="mb-1.5 text-xs font-medium tracking-wide text-neutral-muted uppercase">
        {title}
      </h3>
      <dl className="flex flex-col gap-1.5 text-sm">{children}</dl>
    </div>
  );
}

export function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-2">
      <dt className="text-xs leading-5 text-neutral-muted">{label}</dt>
      <dd className="break-words whitespace-pre-line text-move-navy">{children}</dd>
    </div>
  );
}

function Tags({ tags }: { tags: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5 pt-0.5">
      {tags.map((tag) => (
        <span
          key={tag}
          className="rounded-full border border-neutral-border px-2 py-0.5 text-xs text-move-navy"
        >
          {tag}
        </span>
      ))}
    </div>
  );
}

function tag(label: string, v: string | null): string | null {
  return v == null ? null : `${label}: ${v}`;
}

function withUnit(v: string | null, unit: string): string | null {
  return v == null ? null : `${v} ${unit}`;
}

// Compact, grouped view of every project field; empty fields and empty
// groups are left out.
export function ShipmentProfile({ row }: { row: Row }) {
  const v = (name: string) => value(row, name);

  const origin = joined([v("origin_port"), joined([v("origin_city"), v("origin_country")], ", ")]);
  const destination = joined([
    v("destination_port"),
    joined([v("destination_city"), v("destination_country")], ", "),
  ]);
  const delivery = v("final_delivery_address");

  const counts = joined([
    withUnit(v("pallets"), "pallets"),
    withUnit(v("cartons"), "cartons"),
    withUnit(v("units"), "units"),
  ]);
  const size = joined([withUnit(v("weight_kg"), "kg"), withUnit(v("cbm"), "CBM")]);
  const cargoTags = [
    tag("Stackable", v("stackable")),
    tag("Dangerous goods", v("dangerous_goods")),
    tag("Temp-controlled", v("temperature_controlled")),
  ].filter((t): t is string => t != null);

  const currentTerms = joined([v("current_incoterm"), v("shipment_mode"), v("shipment_type")]);
  const finalTerms = joined([v("final_incoterm"), v("final_shipment_mode"), v("final_shipment_type")]);
  const compare = v("incoterms_to_compare");
  const targetLead = withUnit(v("target_lead_time_days"), "days");

  const perMonth = v("shipments_per_month");
  const perYear = v("shipments_per_year");

  const invoice = v("invoice_value");
  const invoiceCurrency = v("invoice_currency");
  const customsTags = [
    tag("Insurance", v("insurance_required")),
    tag("Brokerage", v("brokerage_needed")),
  ].filter((t): t is string => t != null);

  const packing = joined([
    v("packing_list_available") ? `Available: ${v("packing_list_available")}` : null,
    v("packing_list_reference"),
  ]);
  const packingNotes = v("packing_list_notes");

  const lane = Boolean(origin || destination || delivery);
  const cargo = Boolean(
    v("cargo_description") || v("packaging_type") || counts || size || cargoTags.length ||
      v("special_handling"),
  );
  const termsGroup = Boolean(currentTerms || finalTerms || compare || targetLead);
  const volume = Boolean(perMonth || perYear);
  const customs = Boolean(v("hs_code") || invoice || invoiceCurrency || customsTags.length);
  const packingGroup = Boolean(packing || packingNotes);

  const anything = lane || cargo || termsGroup || volume || customs || packingGroup;

  return (
    <CollapsibleProfile title="Shipment Profile">
      {!anything ? (
        <p className="text-sm text-neutral-muted">No shipment details yet.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {lane && (
            <Group title="Lane">
              {origin && <Line label="From">{origin}</Line>}
              {destination && <Line label="To">{destination}</Line>}
              {delivery && <Line label="Final delivery">{delivery}</Line>}
            </Group>
          )}

          {cargo && (
            <Group title="Cargo">
              {v("cargo_description") && <Line label="Description">{v("cargo_description")}</Line>}
              {v("packaging_type") && <Line label="Packaging">{v("packaging_type")}</Line>}
              {counts && <Line label="Count">{counts}</Line>}
              {size && <Line label="Size">{size}</Line>}
              {v("special_handling") && <Line label="Handling">{v("special_handling")}</Line>}
              {cargoTags.length > 0 && <Tags tags={cargoTags} />}
            </Group>
          )}

          {termsGroup && (
            <Group title="Terms">
              {currentTerms && <Line label="Current">{currentTerms}</Line>}
              {finalTerms && <Line label="Target (final)">{finalTerms}</Line>}
              {compare && <Line label="Compare">{compare}</Line>}
              {targetLead && <Line label="Target lead">{targetLead}</Line>}
            </Group>
          )}

          {volume && (
            <Group title="Volume">
              {perMonth && <Line label="Per month">{perMonth} shipments</Line>}
              {perYear && <Line label="Per year">{perYear} shipments</Line>}
              {perMonth && perYear && (
                <p className="text-xs text-neutral-muted">Annual estimates use the per-year figure.</p>
              )}
            </Group>
          )}

          {customs && (
            <Group title="Customs & Value">
              {v("hs_code") && <Line label="HS code">{v("hs_code")}</Line>}
              {invoice && (
                <Line label="Invoice value">
                  {invoice}
                  {invoiceCurrency && ` (${invoiceCurrency})`}
                </Line>
              )}
              {!invoice && invoiceCurrency && <Line label="Invoice currency">{invoiceCurrency}</Line>}
              {customsTags.length > 0 && <Tags tags={customsTags} />}
            </Group>
          )}

          {packingGroup && (
            <Group title="Packing List">
              {packing && <Line label="Packing list">{packing}</Line>}
              {packingNotes && <Line label="Notes">{packingNotes}</Line>}
            </Group>
          )}
        </div>
      )}
    </CollapsibleProfile>
  );
}

import { ExternalLink } from "lucide-react";
import { mailtoHref, telHref, websiteHref } from "@/lib/contact-links";
import type { ForwarderFields } from "@/lib/forwarder/parse-forwarder-form";
import { CollapsibleProfile } from "../../collapsible-profile";
import { Group, Line } from "../../shipment-profile";

type ProfileFields = Pick<
  ForwarderFields,
  | "next_action"
  | "key_notes"
  | "contact_person"
  | "contact_position"
  | "email"
  | "phone"
  | "website"
  | "headquarters"
  | "footprint"
  | "origin_coverage"
  | "destination_coverage"
  | "other_services"
>;

// break-all: long addresses and URLs have no spaces to wrap at, and the
// profile column is narrow.
const linkClass = "break-all text-move-green hover:underline";

function MaybeLink({ href, children, external = false }: { href: string | null; children: string; external?: boolean }) {
  if (!href) return <>{children}</>;
  return external ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className={linkClass}>
      {children}
      <ExternalLink className="ml-1 inline size-3 align-[-1px]" aria-hidden="true" />
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  ) : (
    <a href={href} className={linkClass}>
      {children}
    </a>
  );
}

// Next Action / Key Notes, always open; hidden when both are empty.
export function ForwarderNotes({ fields }: { fields: ProfileFields }) {
  if (!fields.next_action && !fields.key_notes) return null;
  return (
    <section className="rounded-2xl border border-neutral-border bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3">
        {fields.next_action && (
          <div>
            <h2 className="text-xs font-medium tracking-wide text-neutral-muted uppercase">Next Action</h2>
            <p className="mt-1 text-sm break-words whitespace-pre-line text-move-navy">{fields.next_action}</p>
          </div>
        )}
        {fields.key_notes && (
          <div className="border-t border-neutral-border pt-3 first:border-t-0 first:pt-0">
            <h2 className="text-xs font-medium tracking-wide text-neutral-muted uppercase">Key Notes</h2>
            <p className="mt-1 text-sm break-words whitespace-pre-line text-move-navy">{fields.key_notes}</p>
          </div>
        )}
      </div>
    </section>
  );
}

// Contact, Company, and Coverage; empty fields and groups are left out.
// Collapsed behind a toggle below xl, like the Shipment Profile.
export function ForwarderProfile({ fields }: { fields: ProfileFields }) {
  const contact = Boolean(fields.contact_person || fields.contact_position || fields.email || fields.phone);
  const company = Boolean(fields.website || fields.headquarters || fields.footprint);
  const coverage = Boolean(fields.origin_coverage || fields.destination_coverage || fields.other_services);

  return (
    <CollapsibleProfile title="Forwarder Profile">
      {!contact && !company && !coverage ? (
        <p className="text-sm text-neutral-muted">No contact or company details yet.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {contact && (
            <Group title="Contact">
              {fields.contact_person && <Line label="Name">{fields.contact_person}</Line>}
              {fields.contact_position && <Line label="Position">{fields.contact_position}</Line>}
              {fields.email && (
                <Line label="Email">
                  <MaybeLink href={mailtoHref(fields.email)}>{fields.email}</MaybeLink>
                </Line>
              )}
              {fields.phone && (
                <Line label="Phone">
                  <MaybeLink href={telHref(fields.phone)}>{fields.phone}</MaybeLink>
                </Line>
              )}
            </Group>
          )}

          {company && (
            <Group title="Company">
              {fields.website && (
                <Line label="Website">
                  <MaybeLink href={websiteHref(fields.website)} external>
                    {fields.website}
                  </MaybeLink>
                </Line>
              )}
              {fields.headquarters && <Line label="Headquarters">{fields.headquarters}</Line>}
              {fields.footprint && <Line label="Footprint">{fields.footprint}</Line>}
            </Group>
          )}

          {coverage && (
            <Group title="Coverage">
              {fields.origin_coverage && <Line label="Origin">{fields.origin_coverage}</Line>}
              {fields.destination_coverage && <Line label="Destination">{fields.destination_coverage}</Line>}
              {fields.other_services && <Line label="Other services">{fields.other_services}</Line>}
            </Group>
          )}
        </div>
      )}
    </CollapsibleProfile>
  );
}

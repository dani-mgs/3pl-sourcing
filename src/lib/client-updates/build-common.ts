import type { PublishInputs } from "./publish-inputs";
import type { ClientUpdatePayload, Milestone } from "./payload-schema";

// Parts shared by both builders. Only what the expert typed on the Publish
// form, plus first names: never anything copied from an internal field.

export type People = {
  // Who is publishing, and who owns the project (profiles.first_name only;
  // emails are never read from accounts: the contact email is typed on the
  // form).
  authorFirstName: string | null;
  ownerFirstName: string | null;
};

export type BuildResult<P> = { ok: true; payload: P } | { ok: false; error: string };

export const NOT_SHORTLISTED =
  "Only shortlisted partners can be named to the client. Reload the page and choose again.";

function name(value: string | null): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed.slice(0, 60);
}

export function commonParts(
  inputs: PublishInputs,
  people: People,
  recommendedName: string | null,
): Pick<ClientUpdatePayload, "author" | "contact" | "milestones" | "recommendation"> {
  const milestones: Milestone[] = inputs.milestones.map((m) => ({
    label: m.label,
    planned: m.planned,
    actual: m.actual,
  }));
  return {
    author: { firstName: name(people.authorFirstName) },
    contact: { firstName: name(people.ownerFirstName), email: inputs.contactEmail },
    milestones,
    recommendation: recommendedName
      ? {
          name: recommendedName.slice(0, 120),
          reasons: inputs.reasons,
          tradeOffs: inputs.tradeOffs,
          basedOn: inputs.basedOn,
        }
      : null,
  };
}

export function roundTo(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(Number((value * factor).toPrecision(15))) / factor;
}

// Every partner id the expert chose must be on the shortlist.
export function allShortlisted(ids: string[], shortlist: { id: string }[]): boolean {
  const allowed = new Set(shortlist.map((p) => p.id));
  return ids.every((id) => allowed.has(id));
}

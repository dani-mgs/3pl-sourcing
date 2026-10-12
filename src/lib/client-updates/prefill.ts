import { parsePayload } from "./payload-schema";
import { parseStoredInputs, SECTION_KEYS, type PublishInputs, type Sections } from "./publish-inputs";

// What the Publish form starts with: the project's draft if there is one,
// else its latest published update, else defaults. Stored form inputs are
// used when present; an update without them (for example one the demo seed
// wrote) is read back from its own fields and payload instead.

export type FormDefaults = Omit<PublishInputs, "stage"> & { stage: number | null };

export type StoredUpdate = {
  stage: number;
  headline: string;
  summary: string;
  next_step: string | null;
  next_step_due: string | null;
  needs_client_action: boolean;
  payload: unknown;
  inputs: unknown;
};

export type Partner = { id: string; name: string };

const ALL_SECTIONS: Sections = Object.fromEntries(SECTION_KEYS.map((k) => [k, true])) as Sections;

export function defaultInputs(shortlist: Partner[], suggestedRecommendedId: string | null, basedOn: string | null): FormDefaults {
  const recommended = shortlist.some((p) => p.id === suggestedRecommendedId) ? suggestedRecommendedId : null;
  return {
    stage: null,
    headline: "",
    summary: "",
    nextStep: null,
    nextStepDue: null,
    needsClientAction: false,
    milestones: [],
    partnerIds: shortlist.map((p) => p.id),
    recommendedId: recommended,
    reasons: [],
    tradeOffs: [],
    basedOn,
    sections: ALL_SECTIONS,
    includeAnnual: false,
    contactEmail: null,
  };
}

export function prefillFrom(update: StoredUpdate | null, shortlist: Partner[], fallback: FormDefaults): FormDefaults {
  if (!update) return fallback;
  const allowed = new Set(shortlist.map((p) => p.id));
  const stored = parseStoredInputs(update.inputs);
  if (stored) {
    // Partners that have left the shortlist since are dropped.
    const partnerIds = stored.partnerIds.filter((id) => allowed.has(id));
    return {
      ...stored,
      partnerIds,
      recommendedId: stored.recommendedId && partnerIds.includes(stored.recommendedId) ? stored.recommendedId : null,
    };
  }

  const payload = parsePayload(update.payload);
  const idByName = new Map(shortlist.map((p) => [p.name, p.id]));
  const options = payload?.comparison.options ?? [];
  const partnerIds = options.map((o) => idByName.get(o.name)).filter((id): id is string => id != null);
  const rec = payload?.recommendation ?? null;
  const show = payload?.comparison.show;
  return {
    stage: update.stage,
    headline: update.headline,
    summary: update.summary,
    nextStep: update.next_step,
    nextStepDue: update.next_step_due,
    needsClientAction: update.needs_client_action,
    milestones: payload?.milestones ?? [],
    partnerIds: partnerIds.length ? partnerIds : fallback.partnerIds,
    recommendedId: rec ? (idByName.get(rec.name) ?? null) : null,
    reasons: rec?.reasons ?? [],
    tradeOffs: rec?.tradeOffs ?? [],
    basedOn: rec?.basedOn ?? fallback.basedOn,
    sections: payload
      ? {
          funnel: payload.funnel != null,
          cost: show?.cost === true || payload.comparison.emptyCost != null,
          leadTime: show != null && "leadTime" in show ? show.leadTime : true,
          fcr: show != null && "fcr" in show ? show.fcr : true,
          validity: show != null && "validity" in show ? show.validity : true,
        }
      : ALL_SECTIONS,
    includeAnnual: payload?.kind === "forwarder" && payload.comparison.annual != null,
    contactEmail: payload?.contact.email ?? null,
  };
}

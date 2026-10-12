import { RANKING_EXCLUDED_STATUSES } from "@/lib/forwarder/cost-comparison";
import type { FunnelStep } from "./payload-schema";

// Which partners a client may see by name, and the funnel counts. Fixed
// rules over internal statuses: the statuses themselves never leave the
// server. Partners Move stopped considering (Unfit, Do Not Contact,
// Withdrawn / No Response) count as contacted only, so the counts just
// shrink and nothing hints at why.

const NOT_CONTACTED = "Potential / Not Contacted";
const DO_NOT_CONTACT = new Set(["Do Not Contact", "Do not Contact"]);

// Contacted: anyone past "Potential / Not Contacted", except a Do Not
// Contact partner that never sent a price (Move didn't contact it).
function wasContacted(status: string, id: string, pricedIds: Set<string>): boolean {
  if (status === NOT_CONTACTED) return false;
  return !DO_NOT_CONTACT.has(status) || pricedIds.has(id);
}

// 3PL statuses are spelled slightly differently from the forwarder ones
// ("Do not Contact"), so both spellings count as excluded.
const EXCLUDED = new Set([...RANKING_EXCLUDED_STATUSES, "Do not Contact"]);

export function isExcludedStatus(status: string | null | undefined): boolean {
  return status != null && EXCLUDED.has(status);
}

export type FunnelCount = { step: FunnelStep; count: number };

// ---- Forwarders ------------------------------------------------------------

export type ForwarderPartner = { id: string; company_name: string; status: string; assessment: string | null };

// Named to the client: Shortlisted, or assessed Move Recommended, and still
// in the running.
export function isShortlistedForwarder(f: ForwarderPartner): boolean {
  if (isExcludedStatus(f.status)) return false;
  return f.status === "Shortlisted" || f.assessment === "Move Recommended";
}

// pricedIds: every forwarder with a priced quote, in the running or not.
export function forwarderFunnel(
  forwarders: ForwarderPartner[],
  pricedIds: Set<string>,
  likeForLikeIds: Set<string>,
  recommended: boolean,
): FunnelCount[] {
  const live = forwarders.filter((f) => !isExcludedStatus(f.status));
  return [
    { step: "contacted", count: forwarders.filter((f) => wasContacted(f.status, f.id, pricedIds)).length },
    { step: "quoted", count: live.filter((f) => pricedIds.has(f.id)).length },
    { step: "like_for_like", count: live.filter((f) => likeForLikeIds.has(f.id)).length },
    { step: "shortlisted", count: forwarders.filter(isShortlistedForwarder).length },
    { step: "recommended", count: recommended ? 1 : 0 },
  ];
}

// ---- 3PLs ------------------------------------------------------------------

export type ThreePlPartner = { id: string; company_name: string; status: string; is_incumbent: boolean };

// Statuses that mean the 3PL has engaged with Move (replied).
const REPLIED = new Set([
  "Scheduled for Discovery Call",
  "Waiting for Quotation",
  "Reviewing Quotation",
  "Clarifications",
  "Negotiation",
  "Shortlisted",
  "Vetted",
  "Completed / Closed",
]);

// The current 3PL is the baseline, not a candidate.
function isCandidate(p: ThreePlPartner): boolean {
  return !p.is_incumbent && p.status !== "Baseline";
}

// Named to the client: in the saved recommendation's top three, or
// Shortlisted, and still in the running.
export function threePlShortlist(providers: ThreePlPartner[], recommendationIds: (string | null)[]): ThreePlPartner[] {
  const picked = new Set(recommendationIds.filter((id): id is string => !!id));
  return providers.filter(
    (p) => isCandidate(p) && !isExcludedStatus(p.status) && (picked.has(p.id) || p.status === "Shortlisted"),
  );
}

// quotedIds: every candidate with rates, in the running or not.
export function threePlFunnel(
  providers: ThreePlPartner[],
  quotedIds: Set<string>,
  shortlistCount: number,
  recommended: boolean,
): FunnelCount[] {
  const candidates = providers.filter(isCandidate);
  const live = candidates.filter((p) => !isExcludedStatus(p.status));
  return [
    { step: "contacted", count: candidates.filter((p) => wasContacted(p.status, p.id, quotedIds)).length },
    { step: "replied", count: live.filter((p) => REPLIED.has(p.status) || quotedIds.has(p.id)).length },
    { step: "quoted", count: live.filter((p) => quotedIds.has(p.id)).length },
    { step: "shortlisted", count: shortlistCount },
    { step: "recommended", count: recommended ? 1 : 0 },
  ];
}

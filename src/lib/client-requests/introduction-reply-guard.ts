import { findPartnerIdentity, type IdentityHit, type PartnerIdentity } from "@/lib/client-updates/market-report-guard";

// A staff reply to an introduction request is shown to the client, who knows
// the partner only by its letter. Before it is saved, it is checked with the
// "Move's take" guard (name words, HQ city, website and email domains,
// contact person) against the partner asked for and every other partner the
// client's latest report shows as a letter (a reply naming a different
// letter leaks just as much). Shortlisted partners are named in the report,
// so they may be named here. The database checks the full name again
// (reply_to_client_request). Pure.

export type LabelRow = { forwarder_id: string | null; label: string };

export function introductionGuardIdentities({
  label,
  latestPayload,
  labels,
  forwarders,
}: {
  // The letter asked for ("D").
  label: string;
  latestPayload: unknown;
  labels: LabelRow[];
  forwarders: PartnerIdentity[];
}): PartnerIdentity[] {
  const partners = (latestPayload as { partners?: unknown } | null)?.partners;
  const lettered = new Set(
    (Array.isArray(partners) ? partners : [])
      .map((p) => (p as { label?: unknown }).label)
      .filter((l): l is string => typeof l === "string" && l.startsWith("Partner "))
      .map((l) => l.slice("Partner ".length)),
  );
  lettered.add(label);
  const ids = new Set(labels.filter((l) => l.forwarder_id && lettered.has(l.label)).map((l) => l.forwarder_id));
  return forwarders.filter((f) => ids.has(f.id));
}

export function checkIntroductionReply(reply: string, identities: PartnerIdentity[]): IdentityHit | null {
  return findPartnerIdentity(reply, identities);
}

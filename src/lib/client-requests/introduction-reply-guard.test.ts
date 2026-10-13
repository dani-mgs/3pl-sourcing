import { describe, expect, test } from "vitest";
import type { PartnerIdentity } from "@/lib/client-updates/market-report-guard";
import { checkIntroductionReply, introductionGuardIdentities } from "./introduction-reply-guard";

// A staff reply to "Introduce me to Partner D" must not say who Partner D is
// (or any other letter of the report). The same guard as "Move's take":
// name words, HQ city, website and email domains, contact person.

const id = (n: number) => `00000000-0000-4000-8000-0000000f000${n}`;

const FORWARDERS: PartnerIdentity[] = [
  { id: id(1), company_name: "Pacific Bridge Logistics", website: "pacificbridge.example", headquarters: "Singapore", email: null, contact_person: "Wei Tan" },
  { id: id(2), company_name: "Meridian Ocean Logistics", website: "https://www.meridian-ocean.example", headquarters: "Hong Kong", email: "sales@mol-freight.example", contact_person: "Grace Leung" },
  { id: id(3), company_name: "Redwood Gateway Freight", website: null, headquarters: "Los Angeles, CA", email: null, contact_person: null },
  { id: id(4), company_name: "Swift Tide Cargo", website: null, headquarters: "Da Nang, Vietnam", email: null, contact_person: null },
  { id: id(5), company_name: "Old Letter Freight", website: null, headquarters: "Busan", email: null, contact_person: null },
];
const LABELS = [
  { forwarder_id: id(2), label: "D" },
  { forwarder_id: id(3), label: "E" },
  { forwarder_id: id(4), label: "I" },
  { forwarder_id: id(5), label: "G" },
  { forwarder_id: null, label: "H" },
];
// The latest report: Pacific Bridge named; D, E quoted; I not taken forward.
// G was only in an older report.
const LATEST = {
  partners: [
    { name: "Pacific Bridge Logistics", outcome: "recommended" },
    { label: "Partner D", outcome: "quoted_not_selected" },
    { label: "Partner E", outcome: "quoted_not_selected" },
    { label: "Partner I", outcome: "not_taken_forward" },
  ],
};

const identities = introductionGuardIdentities({ label: "D", latestPayload: LATEST, labels: LABELS, forwarders: FORWARDERS });

describe("which partners a reply to an introduction may not identify", () => {
  test("every letter of the latest report (including the one asked for), never a named partner", () => {
    expect(identities.map((f) => f.company_name).sort()).toEqual(["Meridian Ocean Logistics", "Redwood Gateway Freight", "Swift Tide Cargo"]);
  });

  test("the letter asked for counts even if a newer report dropped it", () => {
    const ids = introductionGuardIdentities({ label: "G", latestPayload: LATEST, labels: LABELS, forwarders: FORWARDERS });
    expect(ids.map((f) => f.company_name)).toContain("Old Letter Freight");
  });

  test("no report or a deleted forwarder: no crash", () => {
    expect(introductionGuardIdentities({ label: "H", latestPayload: null, labels: LABELS, forwarders: FORWARDERS })).toEqual([]);
  });
});

describe("the reply check", () => {
  test.each([
    ["the full name", "We've introduced you to Meridian Ocean Logistics.", "meridian"],
    ["a name word, any case", "MERIDIAN will email you tomorrow.", "meridian"],
    ["the HQ city", "They're based in Hong Kong, so expect a time difference.", "hong kong"],
    ["the website", "See www.meridian-ocean.example for details.", "meridian"],
    ["the email domain", "Write to them at mol-freight.example.", "molfreight"],
    ["the contact person", "Grace will be in touch.", "grace"],
    ["another letter's partner", "Unlike Redwood, they have an in-house broker.", "redwood"],
  ])("refuses %s", (_label, reply, token) => {
    expect(checkIntroductionReply(reply, identities)?.token).toBe(token);
  });

  test.each([
    "We've emailed you both an introduction. Reply-all to set up a call.",
    "Done: you'll get an email from their sales team today.",
    "Pacific Bridge Logistics is still our recommendation; this is a good backup.",
    "Freight forwarding logistics services, ocean cargo.",
  ])("lets through %j", (reply) => {
    expect(checkIntroductionReply(reply, identities)).toBeNull();
  });
});

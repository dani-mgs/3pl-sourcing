import { describe, expect, test } from "vitest";
import { mergeForwarderFields } from "./merge-forwarder-fields";
import { describeMergeRules } from "@/lib/test-support/merge-checks";
import type { ForwarderFormDefaults } from "@/app/(authenticated)/forwarder-sourcing/[id]/forwarders/forwarder-form";

const current: ForwarderFormDefaults = {
  company_name: "Acme Forwarding",
  website: "https://acme.example",
  headquarters: "Rotterdam",
  footprint: "EU, Asia",
  contact_person: "Jane Doe",
  contact_position: "Sales",
  email: "jane@acme.example",
  phone: "+31 10 000 0000",
  origin_coverage: "China",
  destination_coverage: "US",
  other_services: "Warehousing",
  air_freight: true,
  sea_freight: false,
  road_freight: false,
  fcl: true,
  lcl: false,
  courier_express: false,
  customs_brokerage: true,
  cargo_insurance: false,
  door_to_door: false,
  port_to_port: true,
  customs_import_assistance: false,
  status: "Vetted",
  assessment: "Fit",
  next_action: "Call back",
  key_notes: "Internal",
};

describeMergeRules("mergeForwarderFields", mergeForwarderFields, current, {
  // Pipeline judgment and identity: never taken from a document.
  protectedKeys: ["company_name", "status", "assessment", "next_action", "key_notes"],
  textKeys: [
    "website",
    "headquarters",
    "footprint",
    "contact_person",
    "contact_position",
    "email",
    "phone",
    "origin_coverage",
    "destination_coverage",
    "other_services",
  ],
});

describe("mergeForwarderFields: capabilities", () => {
  test("a capability the document explicitly denies is switched off and marked Updated", () => {
    const { merged, changed } = mergeForwarderFields(current, { air_freight: false } as never);
    expect(merged.air_freight).toBe(false);
    expect([...changed]).toEqual(["air_freight"]);
  });

  test("a capability the document explicitly confirms is switched on and marked Updated", () => {
    const { merged, changed } = mergeForwarderFields(current, { lcl: true } as never);
    expect(merged.lcl).toBe(true);
    expect([...changed]).toEqual(["lcl"]);
  });
});

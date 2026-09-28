// Option lists and capability field labels for forwarders. Copied from the
// check constraints in
// supabase/migrations/20260928094641_forwarder_sourcing_tables.sql; keep in
// step if a constraint changes.
//
// These differ from the 3PL provider's status/assessment strings (extra
// statuses, different capitalization/spacing), so they're their own lists
// rather than shared with src/components/provider-form.tsx.

export const FORWARDER_STATUS_OPTIONS = [
  "Potential / Not Contacted",
  "Contacted",
  "RFQ Sent",
  "Scheduled for Discovery / Clarification Call",
  "Waiting for Quotation",
  "Reviewing Quotation",
  "Clarifications",
  "Negotiation",
  "Shortlisted",
  "Vetted",
  "Unfit",
  "Do Not Contact",
  "Withdrawn / No Response",
  "Completed / Closed",
] as const;
export type ForwarderStatus = (typeof FORWARDER_STATUS_OPTIONS)[number];

export const FORWARDER_ASSESSMENT_OPTIONS = [
  "Under Assessment",
  "Fit",
  "Move Recommended",
  "Unfit",
  "Awarded / Approved",
] as const;
export type ForwarderAssessment = (typeof FORWARDER_ASSESSMENT_OPTIONS)[number];

// Capabilities: true = confirmed; false = NOT YET CONFIRMED (not "no"), per
// the migration's comment. The add/edit form and the detail page show all 11
// as filled/outlined toggle chips (mirrors the 3PL provider view); the
// project's forwarder table shows only the confirmed ones, to stay compact.
export const CAPABILITY_FIELDS = [
  { name: "air_freight", label: "Air Freight" },
  { name: "sea_freight", label: "Sea Freight" },
  { name: "road_freight", label: "Road Freight" },
  { name: "fcl", label: "FCL" },
  { name: "lcl", label: "LCL" },
  { name: "courier_express", label: "Courier / Express" },
  { name: "customs_brokerage", label: "Customs Brokerage" },
  { name: "cargo_insurance", label: "Cargo Insurance" },
  { name: "door_to_door", label: "Door to Door" },
  { name: "port_to_port", label: "Port to Port" },
  { name: "customs_import_assistance", label: "Customs Import Assistance" },
] as const;
export type CapabilityKey = (typeof CAPABILITY_FIELDS)[number]["name"];

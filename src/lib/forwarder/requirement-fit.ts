// Requirement fit for the forwarder detail page: which of the forwarder's
// capability flags the project explicitly calls for. Derived only from
// structured project fields; coverage fields are free text and aren't
// matched against the route.
//
// A capability flag of false means "not yet confirmed", not "no" (see
// forwarder-fields.ts), so unmet requirements are "not confirmed".

import { CAPABILITY_FIELDS, type CapabilityKey } from "./forwarder-fields";

export type FitProject = {
  shipment_mode: string | null;
  shipment_type: string | null;
  final_shipment_mode: string | null;
  final_shipment_type: string | null;
  brokerage_needed: string | null;
  insurance_required: string | null;
};

// Which mode/type pair the requirements came from: the final agreed terms,
// or the current ones when the final mode isn't set. Taken as a pair so a
// final mode is never combined with a current type.
export type FitBasis = "final" | "current" | null;

export type Capability = { key: CapabilityKey; label: string };

export type Requirement = Capability & {
  confirmed: boolean;
  // Why it's required, e.g. "Final mode: Sea".
  reason: string;
};

export type RequirementFit = {
  basis: FitBasis;
  requirements: Requirement[];
  // Confirmed capabilities the project didn't ask for.
  alsoOffers: Capability[];
  // Capabilities the project didn't ask for that aren't confirmed.
  notConfirmed: Capability[];
};

const MODE_CAPABILITY: Record<string, CapabilityKey> = {
  Air: "air_freight",
  Sea: "sea_freight",
  Road: "road_freight",
};

// "Air Freight", FTL and LTL have no capability flag of their own; the mode
// requirement already covers them.
const TYPE_CAPABILITY: Record<string, CapabilityKey> = {
  FCL: "fcl",
  LCL: "lcl",
  Courier: "courier_express",
};

// "Quote Both With and Without" needs insurance too: the forwarder has to be
// able to insure to quote the "with" option.
const INSURANCE_REQUIRED = ["Yes", "Quote Both With and Without"];

const LABELS = new Map<CapabilityKey, string>(
  CAPABILITY_FIELDS.map((c) => [c.name, c.label]),
);

export function requirementFit(
  project: FitProject,
  capabilities: Record<CapabilityKey, boolean>,
): RequirementFit {
  const basis: FitBasis =
    project.final_shipment_mode != null
      ? "final"
      : project.shipment_mode != null
        ? "current"
        : null;
  const mode = basis === "final" ? project.final_shipment_mode : project.shipment_mode;
  const type = basis === "final" ? project.final_shipment_type : project.shipment_type;
  const prefix = basis === "final" ? "Final" : "Current";

  const required: { key: CapabilityKey; reason: string }[] = [];
  if (mode && MODE_CAPABILITY[mode]) {
    required.push({ key: MODE_CAPABILITY[mode], reason: `${prefix} mode: ${mode}` });
  }
  if (type && TYPE_CAPABILITY[type]) {
    required.push({ key: TYPE_CAPABILITY[type], reason: `${prefix} type: ${type}` });
  }
  if (project.brokerage_needed === "Yes") {
    required.push({ key: "customs_brokerage", reason: "Brokerage needed" });
  }
  if (project.insurance_required && INSURANCE_REQUIRED.includes(project.insurance_required)) {
    required.push({
      key: "cargo_insurance",
      reason: `Insurance: ${project.insurance_required}`,
    });
  }

  const requiredKeys = new Set(required.map((r) => r.key));
  const rest = CAPABILITY_FIELDS.filter((c) => !requiredKeys.has(c.name)).map((c) => ({
    key: c.name,
    label: c.label,
  }));

  return {
    basis,
    requirements: required.map((r) => ({
      key: r.key,
      label: LABELS.get(r.key)!,
      confirmed: Boolean(capabilities[r.key]),
      reason: r.reason,
    })),
    alsoOffers: rest.filter((c) => capabilities[c.key]),
    notConfirmed: rest.filter((c) => !capabilities[c.key]),
  };
}

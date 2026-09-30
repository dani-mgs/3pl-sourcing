import { describe, expect, test } from "vitest";
import { CAPABILITY_FIELDS, type CapabilityKey } from "./forwarder-fields";
import { requirementFit, type FitProject } from "./requirement-fit";

const none: FitProject = {
  shipment_mode: null,
  shipment_type: null,
  final_shipment_mode: null,
  final_shipment_type: null,
  brokerage_needed: null,
  insurance_required: null,
};

function caps(...on: CapabilityKey[]): Record<CapabilityKey, boolean> {
  return Object.fromEntries(
    CAPABILITY_FIELDS.map((c) => [c.name, on.includes(c.name)]),
  ) as Record<CapabilityKey, boolean>;
}

const keys = (list: { key: string }[]) => list.map((c) => c.key);

describe("requirementFit", () => {
  test("no project requirements: nothing required, everything sorted into also/not confirmed", () => {
    const fit = requirementFit(none, caps("sea_freight", "lcl"));
    expect(fit.basis).toBeNull();
    expect(fit.requirements).toEqual([]);
    expect(keys(fit.alsoOffers)).toEqual(["sea_freight", "lcl"]);
    expect(fit.notConfirmed).toHaveLength(CAPABILITY_FIELDS.length - 2);
  });

  test("uses final mode and type when the final mode is set", () => {
    const fit = requirementFit(
      { ...none, shipment_mode: "Air", shipment_type: "Air Freight", final_shipment_mode: "Sea", final_shipment_type: "LCL" },
      caps("sea_freight"),
    );
    expect(fit.basis).toBe("final");
    expect(fit.requirements).toEqual([
      { key: "sea_freight", label: "Sea Freight", confirmed: true, reason: "Final mode: Sea" },
      { key: "lcl", label: "LCL", confirmed: false, reason: "Final type: LCL" },
    ]);
  });

  test("falls back to the current pair when the final mode isn't set", () => {
    const fit = requirementFit(
      { ...none, shipment_mode: "Sea", shipment_type: "FCL", final_shipment_type: "LCL" },
      caps(),
    );
    expect(fit.basis).toBe("current");
    expect(keys(fit.requirements)).toEqual(["sea_freight", "fcl"]);
    expect(fit.requirements[1].reason).toBe("Current type: FCL");
  });

  test("final mode with no final type: doesn't borrow the current type", () => {
    const fit = requirementFit(
      { ...none, shipment_mode: "Sea", shipment_type: "FCL", final_shipment_mode: "Air" },
      caps(),
    );
    expect(keys(fit.requirements)).toEqual(["air_freight"]);
  });

  test("maps every mode, and Courier to courier_express", () => {
    expect(keys(requirementFit({ ...none, final_shipment_mode: "Road" }, caps()).requirements)).toEqual(["road_freight"]);
    expect(
      keys(requirementFit({ ...none, final_shipment_mode: "Air", final_shipment_type: "Courier" }, caps()).requirements),
    ).toEqual(["air_freight", "courier_express"]);
  });

  test("types without a capability flag add no requirement", () => {
    for (const type of ["Air Freight", "Full Truck Load (FTL)", "Less-than-Truckload (LTL)"]) {
      const mode = type === "Air Freight" ? "Air" : "Road";
      const fit = requirementFit({ ...none, final_shipment_mode: mode, final_shipment_type: type }, caps());
      expect(fit.requirements).toHaveLength(1);
    }
  });

  test("brokerage: only Yes requires customs brokerage (No and N/A don't)", () => {
    expect(keys(requirementFit({ ...none, brokerage_needed: "Yes" }, caps()).requirements)).toEqual(["customs_brokerage"]);
    expect(requirementFit({ ...none, brokerage_needed: "No" }, caps()).requirements).toEqual([]);
    expect(requirementFit({ ...none, brokerage_needed: "N/A" }, caps()).requirements).toEqual([]);
  });

  test("insurance: Yes and Quote Both require cargo insurance, No doesn't", () => {
    expect(keys(requirementFit({ ...none, insurance_required: "Yes" }, caps()).requirements)).toEqual(["cargo_insurance"]);
    const both = requirementFit({ ...none, insurance_required: "Quote Both With and Without" }, caps("cargo_insurance"));
    expect(both.requirements).toEqual([
      {
        key: "cargo_insurance",
        label: "Cargo Insurance",
        confirmed: true,
        reason: "Insurance: Quote Both With and Without",
      },
    ]);
    expect(requirementFit({ ...none, insurance_required: "No" }, caps()).requirements).toEqual([]);
  });

  test("required capabilities are left out of also-offers and not-confirmed", () => {
    const fit = requirementFit(
      { ...none, final_shipment_mode: "Sea", final_shipment_type: "LCL", brokerage_needed: "Yes" },
      caps("sea_freight", "customs_brokerage", "door_to_door"),
    );
    expect(fit.requirements.map((r) => [r.key, r.confirmed])).toEqual([
      ["sea_freight", true],
      ["lcl", false],
      ["customs_brokerage", true],
    ]);
    expect(keys(fit.alsoOffers)).toEqual(["door_to_door"]);
    expect(keys(fit.notConfirmed)).not.toContain("lcl");
    expect(fit.requirements.length + fit.alsoOffers.length + fit.notConfirmed.length).toBe(
      CAPABILITY_FIELDS.length,
    );
  });
});

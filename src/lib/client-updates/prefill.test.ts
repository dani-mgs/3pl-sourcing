import { describe, expect, test } from "vitest";
import { buildForwarderPayload } from "./build-forwarder-payload";
import { toForwarderSource } from "./load-publish-source";
import { defaultInputs, prefillFrom } from "./prefill";
import { PEOPLE, TODAY, forwarderId, forwarderProjectRow, forwarderRows, inputs, quoteRows } from "./__fixtures__/sources";

const SHORTLIST = [
  { id: forwarderId(0), name: "Pacific Bridge Logistics" },
  { id: forwarderId(1), name: "Lotus Freight" },
  { id: forwarderId(2), name: "Saigon Harbor Shipping" },
];

function storedUpdate(withInputs: boolean) {
  const i = inputs({ partnerIds: SHORTLIST.map((p) => p.id), recommendedId: forwarderId(0), includeAnnual: true, contactEmail: "team@move.example" });
  const built = buildForwarderPayload(toForwarderSource(forwarderProjectRow(), forwarderRows(), quoteRows()), i, PEOPLE, TODAY);
  if (!built.ok) throw new Error(built.error);
  return {
    stage: i.stage,
    headline: i.headline,
    summary: i.summary,
    next_step: i.nextStep,
    next_step_due: i.nextStepDue,
    needs_client_action: i.needsClientAction,
    payload: built.payload,
    inputs: withInputs ? i : null,
    expected: i,
  };
}

describe("prefill", () => {
  test("defaults: the whole shortlist, the suggested recommendation, every section, no stage", () => {
    const d = defaultInputs(SHORTLIST, forwarderId(1), "You told us cost matters most.");
    expect(d).toMatchObject({ stage: null, partnerIds: SHORTLIST.map((p) => p.id), recommendedId: forwarderId(1), contactEmail: null });
    expect(Object.values(d.sections).every(Boolean)).toBe(true);
    expect(defaultInputs(SHORTLIST, forwarderId(7), null).recommendedId).toBeNull();
  });

  test("from stored inputs, including the contact email", () => {
    const u = storedUpdate(true);
    expect(prefillFrom(u, SHORTLIST, defaultInputs(SHORTLIST, null, null))).toEqual(u.expected);
  });

  test("a partner that left the shortlist is dropped", () => {
    const u = storedUpdate(true);
    const smaller = SHORTLIST.slice(1);
    const result = prefillFrom(u, smaller, defaultInputs(smaller, null, null));
    expect(result.partnerIds).toEqual([forwarderId(1), forwarderId(2)]);
    expect(result.recommendedId).toBeNull();
  });

  test("without stored inputs, read back from the update itself", () => {
    const u = storedUpdate(false);
    const result = prefillFrom(u, SHORTLIST, defaultInputs(SHORTLIST, null, null));
    expect(result).toEqual({ ...u.expected, partnerIds: SHORTLIST.map((p) => p.id) });
  });

  test("nothing yet: the defaults", () => {
    const d = defaultInputs(SHORTLIST, null, null);
    expect(prefillFrom(null, SHORTLIST, d)).toBe(d);
  });
});

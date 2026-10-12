import { describe, expect, test } from "vitest";
import { buildThreePlPayload, threePlShortlistOf } from "./build-three-pl-payload";
import { toThreePlSource } from "./load-publish-source";
import type { ThreePlPayload } from "./payload-schema";
import { PEOPLE, PROVIDERS, inputs, providerId, providerRows, recommendationRow, threePlProjectRow } from "./__fixtures__/sources";
import type { PublishInputs } from "./publish-inputs";

const SHORTLIST = [providerId(1), providerId(3), providerId(2)];

function build(overrides: Partial<PublishInputs> = {}, list = PROVIDERS, rec: Record<string, unknown> | null = recommendationRow()): ThreePlPayload {
  const source = toThreePlSource(threePlProjectRow(), providerRows(list), rec);
  const result = buildThreePlPayload(source, inputs({ partnerIds: SHORTLIST, recommendedId: providerId(1), ...overrides }), PEOPLE);
  if (!result.ok) throw new Error(result.error);
  return result.payload;
}

describe("buildThreePlPayload", () => {
  test("percent against today's rate card only, never amounts", () => {
    const { comparison, funnel, project } = build();
    expect(comparison.options).toEqual([
      { name: "Harborline Fulfillment", role: "recommended", location: "Shippingtown 1, ST", savingPct: 0.152 },
      { name: "Atlas Commerce Logistics", role: "backup", location: "Shippingtown 3, ST", savingPct: 0.044 },
      { name: "Keystone 3PL", role: "backup", location: "Shippingtown 2, ST", savingPct: 0.092 },
    ]);
    expect(comparison.bestSaving).toEqual({ name: "Harborline Fulfillment", pct: 0.152 });
    expect(comparison.quoted).toBe(4);
    // The incumbent is the baseline, not a candidate; partners out of the
    // running count as contacted only.
    expect(funnel).toEqual([
      { step: "contacted", count: 8 },
      { step: "replied", count: 5 },
      { step: "quoted", count: 4 },
      { step: "shortlisted", count: 3 },
      { step: "recommended", count: 1 },
    ]);
    expect(project).toEqual({
      route: "US East Coast + Texas",
      facts: ["Direct-to-consumer (B2C)", "About 1,200 orders a month", "24-month contract"],
    });
  });

  test("no current 3PL (baseline): no cost chart, the empty state instead", () => {
    const list = PROVIDERS.map((p) => (p.incumbent ? { ...p, incumbent: false, status: "Contacted" } : p));
    const { comparison } = build({}, list);
    expect(comparison.emptyCost).toBe("no_baseline");
    expect(comparison.show.cost).toBe(false);
    expect(comparison.options.every((o) => o.savingPct == null)).toBe(true);
    expect(comparison.bestSaving).toBeNull();
  });

  test("a baseline without rates counts as no baseline", () => {
    const list = PROVIDERS.map((p) => (p.incumbent ? { ...p, costs: undefined } : p));
    expect(build({}, list).comparison.emptyCost).toBe("no_baseline");
  });

  test("rate cards in different currencies aren't compared", () => {
    const list = PROVIDERS.map((p, i) => (i === 2 ? { ...p, currency: "EUR" } : p));
    const { comparison } = build({}, list);
    expect(comparison.emptyCost).toBe("mixed_currencies");
    expect(comparison.options.every((o) => o.savingPct == null)).toBe(true);
  });

  test("fewer than 2 shared options with rates: no chart", () => {
    expect(build({ partnerIds: [providerId(1)] }).comparison.emptyCost).toBe("too_few");
  });

  test("the shortlist is the saved top three plus Shortlisted, minus anyone out of the running", () => {
    const rec = { ...recommendationRow(), provider_id_3: providerId(5) };
    const source = toThreePlSource(threePlProjectRow(), providerRows(), rec);
    expect(threePlShortlistOf(source).map((p) => p.company_name)).toEqual(["Harborline Fulfillment", "Atlas Commerce Logistics"]);
  });

  test("a partner off the shortlist can't be named", () => {
    const source = toThreePlSource(threePlProjectRow(), providerRows(), recommendationRow());
    for (const id of [providerId(0), providerId(4), providerId(5)]) {
      const result = buildThreePlPayload(source, inputs({ partnerIds: [id] }), PEOPLE);
      expect(result.ok).toBe(false);
    }
  });

  test("without a saved recommendation, only Shortlisted 3PLs can be shared", () => {
    const source = toThreePlSource(threePlProjectRow(), providerRows(), null);
    expect(threePlShortlistOf(source).map((p) => p.company_name)).toEqual(["Harborline Fulfillment", "Atlas Commerce Logistics"]);
  });
});

import { describe, expect, test } from "vitest";
import { DRAFT_CANARY, demoClientUpdates } from "../../../scripts/qa/demo-portal-data.mjs";
import { buildForwarderPayload } from "./build-forwarder-payload";
import { toForwarderSource } from "./load-publish-source";
import { clientUpdatePayloadSchema, type ForwarderPayload } from "./payload-schema";
import { PEOPLE, TODAY, forwarderId, forwarderProjectRow, forwarderRows, inputs, quoteRows } from "./__fixtures__/sources";

// The demo seed's client updates are hand-written (the seed can't run the
// TypeScript builders). This keeps them honest: every payload passes the
// app's strict schema, and the latest Brightline forwarder update matches
// what the builder makes from the same forwarders and quotes.

type DemoUpdate = {
  engagement: string;
  daysAgo: number;
  stage: number;
  headline: string;
  summary: string;
  next_step: string | null;
  next_step_due: string | null;
  needs_client_action: boolean;
  isDraft?: boolean;
  payload: unknown;
};

function isoDate(offset: number): string {
  const d = new Date(`${TODAY}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

const updates = demoClientUpdates({ isoDate }) as DemoUpdate[];

describe("demo seed client updates", () => {
  test.each(updates.map((u) => [`${u.engagement} ${u.daysAgo}d ago`, u] as const))("%s passes the strict schema", (_label, u) => {
    const result = clientUpdatePayloadSchema.safeParse(u.payload);
    expect(result.success, JSON.stringify(result.error?.issues)).toBe(true);
    expect(u.stage).toBeGreaterThanOrEqual(1);
    expect(u.stage).toBeLessThanOrEqual(7);
    expect(u.headline.length).toBeLessThanOrEqual(120);
    expect(u.summary.length).toBeLessThanOrEqual(1200);
    expect(JSON.stringify(u)).not.toContain("INTERNAL-CANARY");
  });

  test("2 to 4 published updates per engagement, one draft (Kettle & Pine forwarder) marked DRAFT-CANARY", () => {
    const counts = new Map<string, number>();
    for (const u of updates.filter((u) => !u.isDraft)) counts.set(u.engagement, (counts.get(u.engagement) ?? 0) + 1);
    expect(counts.size).toBe(8);
    for (const [engagement, n] of counts) expect(n, engagement).toBeGreaterThanOrEqual(2);
    for (const [engagement, n] of counts) expect(n, engagement).toBeLessThanOrEqual(4);
    const drafts = updates.filter((u) => u.isDraft);
    expect(drafts.map((d) => d.engagement)).toEqual(["kettleFwd"]);
    expect(drafts[0].headline).toContain(DRAFT_CANARY);
    for (const u of updates.filter((u) => !u.isDraft)) expect(JSON.stringify(u)).not.toContain(DRAFT_CANARY);
  });

  test("the latest Brightline forwarder update is what the builder makes from the same data", () => {
    const latest = updates.filter((u) => u.engagement === "brightlineFwd" && !u.isDraft).sort((a, b) => a.daysAgo - b.daysAgo)[0];
    const seeded = latest.payload as ForwarderPayload;
    const built = buildForwarderPayload(
      toForwarderSource(forwarderProjectRow(), forwarderRows(), quoteRows()),
      inputs({ partnerIds: [forwarderId(0), forwarderId(1), forwarderId(2)], recommendedId: forwarderId(0) }),
      PEOPLE,
      TODAY,
    );
    if (!built.ok) throw new Error(built.error);
    const strip = (p: ForwarderPayload) => ({
      project: p.project,
      funnel: p.funnel,
      comparison: { ...p.comparison, options: p.comparison.options.map((o) => ({ ...o, validUntil: null })) },
    });
    expect(strip(seeded)).toEqual(strip(built.payload));
  });
});

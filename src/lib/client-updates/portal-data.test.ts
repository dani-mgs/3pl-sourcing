import { describe, expect, test } from "vitest";
import { buildTimeline, keyFigures, lastUpdated, monthTicks, needsYou, timelinePosition, toPortalData } from "./portal-data";
import { rowsFor } from "./__fixtures__/portal-rows";
import { TODAY } from "./__fixtures__/sources";

// Runs in every QA timezone: everything here is date-only or UTC.

describe("portal data", () => {
  test("one engagement per project, latest first in its history; needing-you first, completed last", () => {
    const { engagements, unreadable } = toPortalData([...rowsFor("kettle"), ...rowsFor("harbor")]);
    expect(unreadable).toBe(0);
    expect(engagements.map((e) => [e.key, e.latest.stage, e.history.length, e.complete])).toEqual([
      ["key-kettleFwd", 3, 2, false],
      ["key-kettle3pl", 6, 3, false],
      ["key-harbor3pl", 7, 3, true],
    ]);
    const brightline = toPortalData(rowsFor("brightline")).engagements;
    expect(brightline[0].key).toBe("key-brightlineFwd");
    expect(brightline[0].latest.needsClientAction).toBe(true);
  });

  test("a row that doesn't parse is counted, never shown", () => {
    const rows = rowsFor("solace");
    const broken = { ...rows[0], payload: { v: 2, kind: "three_pl" } };
    const mismatched = { ...rows[1], project_kind: "forwarder" };
    const { engagements, unreadable } = toPortalData([broken, mismatched]);
    expect(engagements).toEqual([]);
    expect(unreadable).toBe(2);
  });

  test("key figures come from each project's latest update", () => {
    expect(keyFigures(toPortalData(rowsFor("brightline")).engagements)).toEqual({
      active: 2,
      waiting: 1,
      contacted: 21,
      bestSaving: { pct: 0.1, kind: "forwarder", context: "Freight forwarder project · Ho Chi Minh City → Los Angeles" },
    });
    // A completed project's saving isn't "so far"; Harbor has nothing active.
    expect(keyFigures(toPortalData(rowsFor("harbor")).engagements)).toMatchObject({ active: 0, waiting: 0, bestSaving: null });
  });

  test("what needs the client, with the project named", () => {
    expect(needsYou(toPortalData(rowsFor("brightline")).engagements, TODAY)).toEqual([
      { key: "key-brightlineFwd", text: "Your decision, by Oct 17 (your freight forwarder project)" },
    ]);
    expect(needsYou(toPortalData(rowsFor("ridgeway")).engagements, TODAY)).toEqual([]);
  });

  test("timeline: stage stretches from the published history, the current one up to today, then planned", () => {
    const t = buildTimeline(toPortalData(rowsFor("brightline")).engagements, TODAY)!;
    const fwd = t.rows.find((r) => r.key === "key-brightlineFwd")!;
    expect(fwd.segments).toEqual([
      { from: "2026-09-18", to: "2026-09-30", stage: 2, state: "done" },
      { from: "2026-09-30", to: "2026-10-09", stage: 3, state: "done" },
      { from: "2026-10-09", to: "2026-10-12", stage: 5, state: "now" },
      { from: "2026-10-12", to: "2026-11-01", stage: 5, state: "planned" },
    ]);
    expect(fwd.markers.map((m) => [m.label, m.done])).toEqual([
      ["Quotes due", true],
      ["Shortlist", true],
      ["Your decision", false],
      ["First booking", false],
    ]);
    expect(t.start).toBe("2026-09-15");
    expect(t.end).toBe("2026-11-13"); // the 3PL's planned recommendation (Nov 6) plus a week
    expect(timelinePosition(t, t.start)).toBe(0);
    expect(timelinePosition(t, t.end)).toBe(100);
    expect(monthTicks(t).map((m) => m.label)).toEqual(["Oct", "Nov"]);
  });

  test("a completed project has no 'now' and no planned stretch", () => {
    const t = buildTimeline(toPortalData(rowsFor("harbor")).engagements, TODAY)!;
    expect(t.rows[0].segments.map((s) => s.state)).toEqual(["done", "done", "done"]);
  });

  test("last updated: the newest published update across projects, first name only", () => {
    expect(lastUpdated(toPortalData(rowsFor("kettle")).engagements)).toEqual({
      publishedAt: "2026-10-10T10:00:00Z",
      author: "Alex",
    });
    expect(buildTimeline([], TODAY)).toBeNull();
  });
});

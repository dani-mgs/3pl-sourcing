import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { reviewedStatus } from "./__fixtures__/duty-tables";
import { lockedVersion, versionMeta } from "./__fixtures__/locked-version";
import { scenario, skuLine, tables, vietnamScenario } from "./__fixtures__/workspace-builders";
import { toComparisonView } from "./comparison-view";
import { CHARACTERS_NOTE, undrawable } from "./pdf-text";
import { toResultViews } from "./result-view";
import { buildVersionReport, INCOMPLETE_TITLE, type ReportBlock, type VersionReport } from "./version-report";

// A locked version's PDF content, from the stored snapshot only: the screen's
// own wording, every string drawable by the PDF font, and the incomplete
// banner and characters note when they apply.

beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
afterEach(() => vi.restoreAllMocks());

const texts = (r: VersionReport): string[] => [
  r.title, ...r.headerLines, r.banner?.title ?? "", ...(r.banner?.lines ?? []), r.footerLabel, r.disclaimer,
  ...r.blocks.flatMap((b: ReportBlock) =>
    b.kind === "table" ? [...b.columns.map((c) => c.header), ...b.rows.flat()]
      : b.kind === "pairs" ? b.pairs.flat()
        : b.kind === "list" ? b.items
          : [b.text]),
];
const tables_ = (r: VersionReport) => r.blocks.filter((b): b is Extract<ReportBlock, { kind: "table" }> => b.kind === "table");

describe("single origin (golden China)", () => {
  test("header, inputs, totals, per-SKU table, duty layers and fees; no comparison", async () => {
    const { restored } = await lockedVersion({});
    const r = buildVersionReport(versionMeta(), restored);
    expect(r.title).toBe("Landed cost estimate");
    expect(r.headerLines).toEqual([
      "Golden",
      "Locked version v3, locked on 2 Oct 2026 by Dani",
      "Entry date 5 Nov 2026 · HTS release Revision 20 (2026HTSRev20) · Duty data as of 2 Oct 2026",
    ]);
    expect(r.banner).toBeNull();
    expect(r.characterNote).toBeNull();
    expect(r.footerLabel).toBe("Golden · v3");
    expect(r.disclaimer).toBe(
      "Estimate for planning only, based on duty data as of 2 Oct 2026. Rates and fees can change. Not customs or legal advice.",
    );
    expect(r.creationDate.toISOString()).toBe("2026-10-02T09:30:00.123Z");
    const all = texts(r);
    expect(all).not.toContain("Compare origins");
    expect(all).toContain("Formal entry, as chosen for this scenario.");
    const [totals, perSku] = tables_(r);
    expect(totals.rows.at(-1)).toEqual(["Total", "$1,734.73", "$17.35", "100.0%"]);
    expect(perSku.columns.map((c) => c.header)).toEqual(["SKU", "Description", "HTS", "Qty", "FOB/unit", "Landed/unit", "Duties"]);
    expect(perSku.rows[0]).toEqual(expect.arrayContaining(["SKU-001", "100", "$6.00", "$17.35"]));
    const view = toResultViews(restored.result, restored.workspace)[restored.workspace.scenarios[0].id];
    if (view.state !== "complete") throw new Error(view.state);
    expect(all).toContain(view.skus[0].lastVerified);
  });

  test("every string of our own is drawable by the PDF font as is", async () => {
    const { restored } = await lockedVersion({ scenarios: [scenario(), vietnamScenario({ shipmentMode: "Air" })] });
    const r = buildVersionReport(versionMeta(), restored);
    expect(texts(r).flatMap(undrawable)).toEqual([]);
    expect(r.characterNote).toBeNull();
  });
});

describe("several origins", () => {
  test("the comparison first, worded exactly as on screen; each origin on a new page", async () => {
    const { restored } = await lockedVersion({ scenarios: [scenario(), vietnamScenario()] });
    const r = buildVersionReport(versionMeta(), restored);
    const view = toComparisonView(restored.result, restored.workspace);
    if (view.state !== "ready") throw new Error(view.state);
    expect(r.blocks[0]).toEqual({ kind: "heading", level: 1, text: "Compare origins" });
    expect(r.blocks[1]).toEqual({ kind: "paragraph", text: view.verdict!.text, tone: "strong" });
    expect(view.verdict!.text).toBe("China is $2.34/unit cheaper than Vietnam (11.9%).");
    const all = texts(r);
    for (const line of view.drivers[0].lines) expect(all).toContain(line);
    expect(tables_(r)[0].rows).toEqual([
      ["1", "China (baseline)", "Lowest landed cost", "$17.35", "$1,734.73", "Baseline"],
      ["2", "Vietnam", "Highest landed cost", "$19.69", "$1,968.58", "$2.34/unit more than the baseline (13.5%)"],
    ]);
    expect(tables_(r)[1].rows).toEqual([["SKU-001", "$17.35", "$19.69", "China"]]);
    const origins = r.blocks.filter((b) => b.kind === "heading" && b.level === 1).slice(1);
    expect(origins).toEqual([
      { kind: "heading", level: 1, text: "China (baseline)", newPage: true },
      { kind: "heading", level: 1, text: "Vietnam", newPage: true },
    ]);
    // The same figures as the screen's result panels.
    const views = toResultViews(restored.result, restored.workspace);
    for (const v of Object.values(views)) if (v.state === "complete") expect(all).toContain(v.total);
  });

  test("not comparable: the reasons, no ranking", async () => {
    const { restored } = await lockedVersion({ scenarios: [scenario(), vietnamScenario({ incoterm: "EXW" })] });
    const all = texts(buildVersionReport(versionMeta(), restored));
    expect(all).toContain("Vietnam: Incoterm EXW differs from the baseline's FOB. Its own totals are shown; it isn't ranked.");
    expect(all).not.toContain("Ranking");
    expect(all.some((s) => s.startsWith("No other origin can be compared"))).toBe(true);
  });
});

describe("incomplete", () => {
  test("a banner with the reasons, per origin", async () => {
    const pending = { ...tables(), duty_program_review_status: [reviewedStatus("section_301_forced_labor")] };
    const { restored } = await lockedVersion({}, pending);
    const r = buildVersionReport(versionMeta({ incomplete: true }), restored);
    expect(r.banner?.title).toBe(INCOMPLETE_TITLE);
    expect(r.banner?.title).toBe("Incomplete estimate: some duties or fees are not final");
    expect(r.banner?.lines.length).toBeGreaterThan(0);
    for (const line of r.banner!.lines) expect(line).toMatch(/^China: /);
    expect(r.banner!.lines.join(" ")).toMatch(/Section 301 \(China\)/);
  });
});

describe("characters the font can't draw", () => {
  test("typed text keeps what it can, shows ? for the rest, and the note appears once", async () => {
    const { restored } = await lockedVersion({
      name: "Q4 → 陶瓷",
      skuLines: [skuLine({ description: "Mug 陶瓷杯 – café ★" })],
      scenarios: [scenario({ supplierName: "Ningbo 宁波 Ceramics" })],
    });
    const r = buildVersionReport(versionMeta({ workspaceName: "Q4 → 陶瓷" }), restored);
    expect(r.characterNote).toBe(CHARACTERS_NOTE);
    expect(r.headerLines[0]).toBe("Q4 ? ??");
    const all = texts(r);
    expect(all).toContain("Mug ??? – café ?");
    expect(all).toContain("Ningbo ?? Ceramics");
    expect(all.flatMap(undrawable)).toEqual([]);
  });
});

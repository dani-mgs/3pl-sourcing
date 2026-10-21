import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { stubSupabase } from "@/lib/tariff/__fixtures__/supabase-stub";
import { CALCULATED_ON } from "./__fixtures__/duty-tables";
import { scenario, skuLine, tables, vietnamScenario, workspace } from "./__fixtures__/workspace-builders";
import { lockedVersion } from "./__fixtures__/locked-version";
import { DRAFT_NOTE, buildWorkspaceCsv, plainCents, versionFilename, workspaceCsvFilename } from "./export-csv";
import { computeWorkspaceResult } from "./server-compute";
import type { Workspace } from "./workspace-schema";

// The CSV built on the server from the pipeline's real result on the stub
// tables: the golden figures as plain 2-decimal numbers, incomplete and
// not-calculated origins in words, the comparison, and every user-typed cell
// safe from formula injection.

beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
afterEach(() => vi.restoreAllMocks());

async function csvOf(w: Workspace): Promise<string> {
  return buildWorkspaceCsv(w, await computeWorkspaceResult(stubSupabase(tables()), w, CALCULATED_ON));
}
// The rows of the section with this title (up to the blank line).
function sectionRows(csv: string, title: string): string[] {
  const blocks = csv.split("\r\n\r\n");
  const block = blocks.find((b) => b.split("\r\n")[0] === title);
  if (!block) throw new Error(`no section "${title}" in:\n${csv}`);
  return block.split("\r\n").slice(1).filter(Boolean);
}

describe("header and format", () => {
  test("the first lines: workspace, entry date, calculated on, the DRAFT line; CRLF throughout", async () => {
    const csv = await csvOf(workspace());
    expect(csv.split("\r\n").slice(0, 6)).toEqual([
      "Landed Cost workspace",
      "Field,Value",
      `Workspace,${workspace().name}`,
      `Entry date,${workspace().entryDate}`,
      `Calculated on,${CALCULATED_ON}`,
      `Status,${DRAFT_NOTE}`,
    ]);
    expect(DRAFT_NOTE).toBe("DRAFT: not a locked estimate. Figures change when inputs or duty data change.");
    expect(csv.replace(/\r\n/g, "")).not.toMatch(/\n/);
  });

  test("filename and plain money", () => {
    expect(workspaceCsvFilename("Q4: mugs / lamps", "2026-10-21")).toBe("landed-cost-Q4-mugs-lamps-2026-10-21-draft.csv");
    expect([plainCents(BigInt(173473)), plainCents(BigInt(5)), plainCents(BigInt(0))]).toEqual(["1734.73", "0.05", "0.00"]);
  });
});

describe("one complete origin (golden China)", () => {
  test("inputs, per-SKU results, duty layers, fees with the entry type, totals: money as plain numbers", async () => {
    const csv = await csvOf(workspace());
    expect(sectionRows(csv, "SKUs (shared by every origin)")).toEqual([
      "SKU,Description,HTS code,Quantity (pcs),Duty quantity,Duty quantity unit",
      expect.stringMatching(/^SKU-001,,\d{4}\.\d{2}\.\d{2}\.\d{2},100,,$/),
    ]);
    const inputs = sectionRows(csv, "China: inputs");
    expect(inputs).toEqual(expect.arrayContaining(["Baseline,Yes", "Incoterm,FOB", "Freight total (USD),854.00", "Entry type,Formal"]));
    const perSku = sectionRows(csv, "China: results per SKU");
    expect(perSku[0]).toBe(
      "SKU,HTS code,Status,Product (USD),Freight (USD),Duties (USD),MPF (USD),HMF (USD),Other costs (USD),Total (USD),Per unit (USD),Effective duty rate",
    );
    expect(perSku[1]).toMatch(/^SKU-001,[\d.]+,Complete,600\.00,854\.00,[\d.]+,[\d.]+,[\d.]+,[\d.]+,1734\.73,17\.35,[\d.]+%$/);
    const layers = sectionRows(csv, "China: duty layers");
    expect(layers[0]).toBe("SKU,Layer,Heading,Rate,Amount (USD),Source,Source URL,Source checked on,Last verified");
    expect(layers.length).toBeGreaterThan(1);
    for (const row of layers.slice(1)) expect(row).toMatch(/^SKU-001,.*,\d+\.\d{2},/);
    const fees = sectionRows(csv, "China: fees");
    expect(fees[1]).toBe('Entry type used,,,"Formal, as chosen for this origin"');
    expect(fees[2]).toMatch(/^MPF,.+,\d+\.\d{2},/);
    const totals = sectionRows(csv, "China: totals");
    expect(totals).toEqual(expect.arrayContaining(["Total,1734.73,17.35,", "Units (pcs),100,,", "Status,Complete,,"]));
    // Money never carries "$" or a thousands comma in a number cell.
    expect(totals.join("\n")).not.toMatch(/\$/);
    // One origin: no comparison.
    expect(csv).not.toMatch(/\r\nComparison/);
  });
});

describe("incomplete and not calculated", () => {
  test("an incomplete origin: its totals say what's missing", async () => {
    const csv = await csvOf(workspace({ scenarios: [scenario({ freightTotalUsd: null })] }));
    expect(sectionRows(csv, "China: totals")).toEqual(["Incomplete: Freight total (USD)"]);
    expect(sectionRows(csv, "China: results per SKU")[1]).toMatch(/^SKU-001,[\d.]+,Complete,,,[\d.]+,,,,,,/);
  });

  test("an entry date out of range: every origin and the comparison say it wasn't calculated", async () => {
    const csv = await csvOf(workspace({ entryDate: "2026-09-01", scenarios: [scenario(), vietnamScenario()] }));
    expect(sectionRows(csv, "China: totals")[0]).toMatch(/^"?Not calculated: /);
    expect(sectionRows(csv, "Vietnam: totals")[0]).toMatch(/^"?Not calculated: /);
    expect(sectionRows(csv, "Comparison")[0]).toMatch(/^"?Not calculated: /);
  });
});

describe("several origins: the comparison", () => {
  test("golden China vs Vietnam: verdict, ranking, per-SKU table, drivers with a direction in words", async () => {
    const csv = await csvOf(workspace({ scenarios: [scenario(), vietnamScenario()] }));
    expect(sectionRows(csv, "Comparison: verdict")).toEqual(["China is $2.34/unit cheaper than Vietnam (11.9%).", "$233.85 less per shipment."]);
    expect(sectionRows(csv, "Comparison: ranking")).toEqual([
      "Rank,Origin,Baseline,Position,Per unit (USD),Shipment total (USD),Against the baseline",
      "1,China,Yes,Lowest landed cost,17.35,1734.73,Baseline",
      "2,Vietnam,No,Highest landed cost,19.69,1968.58,$2.34/unit more than the baseline (13.5%)",
    ]);
    expect(sectionRows(csv, "Comparison: per-SKU landed cost per unit")).toEqual([
      "SKU,China (baseline) per unit (USD),Vietnam per unit (USD),Lowest",
      "SKU-001,17.35,19.69,China",
    ]);
    const drivers = sectionRows(csv, "Comparison: drivers against the baseline");
    expect(drivers[0]).toBe("Origin,Component,Direction,Per shipment (USD),Per unit (USD),In words");
    expect(drivers).toEqual(
      expect.arrayContaining([
        "Vietnam,Product (FOB),More,200.00,2.00,$2.00/unit more on product ($200.00 more per shipment)",
        "Vietnam,Duties,Less,165.40,1.65,$1.65/unit less on duties ($165.40 less per shipment)",
        "Vietnam,Other costs,Same,0.00,0.00,Same other costs",
      ]),
    );
    expect(csv).toMatch(/\r\nVietnam: totals\r\n/);
  });

  test("not comparable: the reasons, and no ranking", async () => {
    const csv = await csvOf(workspace({ scenarios: [scenario(), vietnamScenario({ incoterm: "EXW" })] }));
    expect(sectionRows(csv, "Comparison: not comparable with the baseline")).toEqual([
      "Origin,Reasons",
      "Vietnam,Incoterm EXW differs from the baseline's FOB.",
    ]);
    expect(csv).not.toMatch(/Comparison: ranking/);
    expect(sectionRows(csv, "Comparison: verdict")[0]).toMatch(/^"?No other origin can be compared/);
  });
});

describe("formula injection", () => {
  test("cells and section titles starting with =, +, - or @ are written as text", async () => {
    const w = workspace({
      name: "=HYPERLINK(\"http://x\")",
      skuLines: [skuLine({ skuCode: "+SKU", description: "-2+3" })],
      scenarios: [scenario({ label: "@China", supplierName: "=cmd|' /C calc'!A0", otherCosts: [{ id: "00000000-0000-4000-8000-000000000901", label: "-Brokerage", amountUsd: "95" }] })],
    });
    const csv = await csvOf(w);
    const cells = csv.split("\r\n").flatMap((line) => line.split(","));
    for (const cell of cells) expect(cell.replace(/^"/, "")).not.toMatch(/^[=+\-@]/);
    expect(csv).toContain(`Workspace,"'=HYPERLINK(""http://x"")"`);
    expect(csv).toContain("'+SKU,'-2+3");
    expect(csv).toContain("\r\n'@China: inputs\r\n");
    expect(csv).toContain("Other cost: -Brokerage (USD),95.00");
  });
});

describe("a locked version's CSV", () => {
  const locked = { versionNo: 3, lockedOn: "Oct 2, 2026", byName: "Dani", release: "Revision 20 (2026HTSRev20)", asOf: "Oct 2, 2026" };

  test("the LOCKED line in place of DRAFT, with the release and the duty-data date", async () => {
    const { restored } = await lockedVersion({ scenarios: [scenario(), vietnamScenario()] });
    const csv = buildWorkspaceCsv(restored.workspace, restored.result, locked);
    expect(sectionRows(csv, "Landed Cost workspace")).toEqual([
      "Field,Value",
      "Workspace,Golden",
      `Entry date,${restored.workspace.entryDate}`,
      `Calculated on,${CALCULATED_ON}`,
      "Status,\"LOCKED VERSION v3, locked on Oct 2, 2026 by Dani. These figures are fixed.\"",
      "HTS release,Revision 20 (2026HTSRev20)",
      "Duty data as of,\"Oct 2, 2026\"",
    ]);
    expect(csv).not.toContain("DRAFT");
  });

  test("the golden China vs Vietnam figures exactly as stored", async () => {
    const { snapshot, restored } = await lockedVersion({ scenarios: [scenario(), vietnamScenario()] });
    const csv = buildWorkspaceCsv(restored.workspace, restored.result, locked);
    expect(snapshot.result.origins.map((o) => [o.totalUsd, o.perUnitUsd])).toEqual([["1734.73", "17.35"], ["1968.58", "19.69"]]);
    expect(sectionRows(csv, "China: totals")).toEqual(expect.arrayContaining(["Total,1734.73,17.35,"]));
    expect(sectionRows(csv, "Vietnam: totals")).toEqual(expect.arrayContaining(["Total,1968.58,19.69,"]));
    expect(sectionRows(csv, "Comparison: ranking")).toEqual([
      "Rank,Origin,Baseline,Position,Per unit (USD),Shipment total (USD),Against the baseline",
      "1,China,Yes,Lowest landed cost,17.35,1734.73,Baseline",
      "2,Vietnam,No,Highest landed cost,19.69,1968.58,$2.34/unit more than the baseline (13.5%)",
    ]);
  });

  test("formula injection is escaped as in the draft CSV, typed names included", async () => {
    const { restored } = await lockedVersion({ name: "=cmd|' /C calc'!A0", skuLines: [skuLine({ skuCode: "@SUM" })] });
    const csv = buildWorkspaceCsv(restored.workspace, restored.result, { ...locked, byName: "+Dani" });
    expect(csv).toContain("Workspace,'=cmd|' /C calc'!A0");
    expect(csv).toContain("'@SUM,");
    expect(csv).toContain("by +Dani");
    for (const cell of csv.split("\r\n").flatMap((l) => l.split(","))) expect(cell.replace(/^"/, "")).not.toMatch(/^[=+\-@]/);
  });

  test("the version filename", () => {
    expect(versionFilename("Q4: mugs", 3, "2026-10-02", "pdf")).toBe("landed-cost-Q4-mugs-v3-2026-10-02.pdf");
    expect(versionFilename("Q4: mugs", 3, "2026-10-02", "csv")).toBe("landed-cost-Q4-mugs-v3-2026-10-02.csv");
  });
});

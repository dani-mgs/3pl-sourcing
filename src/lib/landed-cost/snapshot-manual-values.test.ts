import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { stubSupabase } from "@/lib/tariff/__fixtures__/supabase-stub";
import { CALCULATED_ON } from "./__fixtures__/duty-tables";
import { LOCKED_IDS, versionMeta } from "./__fixtures__/locked-version";
import { item, S1, scenario, tables, vietnamScenario, workspace } from "./__fixtures__/workspace-builders";
import { buildWorkspaceCsv, type LockedCsv } from "./export-csv";
import { renderVersionPdf } from "./render-version-pdf";
import { toResultViews } from "./result-view";
import { computeWorkspaceResult } from "./server-compute";
import { buildSnapshotRow, parseSnapshot, restoreSnapshot, type SnapshotRow } from "./snapshot-schema";
import { buildVersionReport } from "./version-report";
import type { RateOverride, Workspace } from "./workspace-schema";

// B-15: a locked version keeps each manual rate's value as it was saved, and
// the database gives a numeric back as typed ("250", not "250.00"). Every
// earlier fixture wrote fixed amounts with two decimals, so a version with a
// fixed amount typed without them could be locked but never opened. Versions
// with a %-only, a fixed-only and both kinds of manual rate, values shaped as
// the database returns them, must open (parse and restore), show on the page,
// and export as PDF and CSV.

beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
afterEach(() => vi.restoreAllMocks());

const DANI = "00000000-0000-4000-8000-0000000000a1";
const LOCKED: LockedCsv = { versionNo: 4, lockedOn: "2 Oct 2026", byName: "Dani", release: "R", asOf: "2 Oct 2026" };
const manual = (over: Partial<RateOverride>): RateOverride => ({
  id: "00000000-0000-4000-8000-000000000401", kind: "add", layerKey: null, label: "QA duty", ratePercent: null, amountUsd: null,
  reason: "Broker quote", engineRateText: null, engineAmountUsd: null, sortOrder: 0, setBy: DANI,
  setAt: "2026-10-01T09:00:00Z", changedBy: DANI, changedAt: "2026-10-01T09:00:00Z", ...over,
});
const rate = manual({ label: "QA rate duty", ratePercent: "5" });
const fixed = (amountUsd: string) => manual({ id: "00000000-0000-4000-8000-000000000402", label: "QA fixed duty", amountUsd, sortOrder: 1 });

async function build(w: Workspace): Promise<SnapshotRow> {
  const result = await computeWorkspaceResult(stubSupabase({ ...tables(), profiles: [{ id: DANI, first_name: "Dani" }] }), w, CALCULATED_ON);
  const built = buildSnapshotRow(w, result);
  if (!built.ok) throw new Error(built.error);
  // As stored and read back: JSON.
  return JSON.parse(JSON.stringify(built.row));
}
const withRates = (overrides: RateOverride[]) =>
  workspace({ ...LOCKED_IDS, scenarios: [scenario({ items: [item({ overrides })] }), vietnamScenario()] });

async function opened(overrides: RateOverride[]) {
  const row = await build(withRates(overrides));
  const parsed = parseSnapshot(row);
  if (!parsed.ok) throw new Error("doesn't parse");
  const back = restoreSnapshot(parsed.snapshot);
  const view = toResultViews(back.result, back.workspace)[S1];
  if (view.state !== "complete") throw new Error("not complete");
  const layers = view.skus[0].layers.filter((l) => l.manual);
  const report = buildVersionReport(versionMeta(), back);
  const pdf = await renderVersionPdf(report);
  const csv = buildWorkspaceCsv(back.workspace, back.result, LOCKED);
  return { row, layers, report, pdf, csv };
}

async function pdfText(buffer: Buffer): Promise<string> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: buffer });
  try {
    return (await parser.getText()).pages.map((p) => p.text).join(" ").replace(/\s+/g, " ");
  } finally {
    await parser.destroy();
  }
}

describe("a locked version with manual rates opens and exports", () => {
  test("%-only", async () => {
    const { layers, report, pdf, csv } = await opened([rate]);
    expect(layers.map((l) => [l.label, l.manual?.value, l.amount])).toEqual([["QA rate duty", "5%", "$30.00"]]);
    expect(report.manualBox?.lines).toEqual(["China, SKU-001: QA rate duty, 5%. Reason: Broker quote"]);
    expect(await pdfText(pdf)).toContain("China, SKU-001: QA rate duty, 5%. Reason: Broker quote");
    expect(csv).toContain(",Yes,5%,,Broker quote,Dani,2026-10-01");
  });

  test.each([
    ["250", "$250.00", "250.00"],
    ["250.5", "$250.50", "250.50"],
    ["0", "$0.00", "0.00"],
    ["12.34", "$12.34", "12.34"],
  ])("fixed-only, saved as %s", async (saved, shown, cents) => {
    const { row, layers, report, pdf, csv } = await opened([fixed(saved)]);
    // Stored as saved; the layer's amount is money.
    const line = row.result.origins[0].skus[0].duty.lines.find((l) => l.manual);
    expect(line?.manual).toMatchObject({ ratePercent: null, amountUsd: saved });
    expect(line?.amountUsd).toBe(cents);
    expect(row.inputs.scenarios[0].items[0].overrides[0]).toMatchObject({ ratePercent: null, amountUsd: saved });

    expect(layers.map((l) => [l.label, l.manual?.value, l.amount])).toEqual([["QA fixed duty", `${shown} fixed`, shown]]);
    expect(report.manualBox?.lines).toEqual([`China, SKU-001: QA fixed duty, ${shown} fixed. Reason: Broker quote`]);
    expect(await pdfText(pdf)).toContain(`China, SKU-001: QA fixed duty, ${shown} fixed. Reason: Broker quote`);
    expect(csv).toContain(`,Yes,Fixed ${cents},,Broker quote,Dani,2026-10-01`);
  });

  test("both kinds", async () => {
    const { layers, report, pdf, csv } = await opened([rate, fixed("250")]);
    expect(layers.map((l) => l.manual?.value)).toEqual(["5%", "$250.00 fixed"]);
    expect(report.manualBox?.lines).toEqual([
      "China, SKU-001: QA rate duty, 5%. Reason: Broker quote",
      "China, SKU-001: QA fixed duty, $250.00 fixed. Reason: Broker quote",
    ]);
    const text = await pdfText(pdf);
    expect(text).toContain("QA rate duty, 5%.");
    expect(text).toContain("QA fixed duty, $250.00 fixed.");
    expect(csv).toContain(",Yes,5%,,Broker quote,Dani,2026-10-01");
    expect(csv).toContain(",Yes,Fixed 250.00,,Broker quote,Dani,2026-10-01");
  });
});

describe("a manual rate has exactly one of ratePercent and amountUsd", () => {
  const mutate = async (change: (row: SnapshotRow) => void) => {
    const row = await build(withRates([fixed("250")]));
    change(row);
    return parseSnapshot(row).ok;
  };
  const layer = (row: SnapshotRow) => row.result.origins[0].skus[0].duty.lines.find((l) => l.manual)!.manual!;
  const input = (row: SnapshotRow) => row.inputs.scenarios[0].items[0].overrides[0];

  test("as locked, it parses", async () => {
    expect(await mutate(() => {})).toBe(true);
  });
  test.each([
    ["neither, on the layer", (r: SnapshotRow) => void (layer(r).amountUsd = null)],
    ["both, on the layer", (r: SnapshotRow) => void (layer(r).ratePercent = "5")],
    ["neither, in the inputs", (r: SnapshotRow) => void (input(r).amountUsd = null)],
    ["both, in the inputs", (r: SnapshotRow) => void (input(r).ratePercent = "5")],
    ["more decimals than the database keeps", (r: SnapshotRow) => void (layer(r).amountUsd = "250.001")],
    ["not a number", (r: SnapshotRow) => void (layer(r).amountUsd = "$250")],
  ])("%s: refused", async (_, change) => {
    expect(await mutate(change)).toBe(false);
  });
});

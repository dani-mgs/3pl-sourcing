import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { stubSupabase } from "@/lib/tariff/__fixtures__/supabase-stub";
import { CALCULATED_ON, reviewedStatus } from "./__fixtures__/duty-tables";
import { LOCKED_IDS, versionMeta } from "./__fixtures__/locked-version";
import { item, scenario, tables, vietnamScenario, workspace } from "./__fixtures__/workspace-builders";
import { buildWorkspaceCsv, type LockedCsv } from "./export-csv";
import { renderVersionPdf } from "./render-version-pdf";
import { computeWorkspaceResult } from "./server-compute";
import { buildSnapshotRow, parseSnapshot, restoreSnapshot, type SnapshotRow } from "./snapshot-schema";
import { buildVersionReport, MANUAL_RATES_TITLE } from "./version-report";
import type { RateOverride, Workspace } from "./workspace-schema";

// Manual rates in the exports: in full (Manual, value, app rate, reason, set
// by, set on; the PDF's page-1 box and per-origin table) when there is at
// least one, and otherwise byte for byte what the exports were before (the
// hashes were taken from the code as it was before manual-rate columns
// existed, for drafts, version 2 rows and version 1 rows).

beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
afterEach(() => vi.restoreAllMocks());

const DANI = "00000000-0000-4000-8000-0000000000a1";
const LOCKED: LockedCsv = { versionNo: 3, lockedOn: "2 Oct 2026", byName: "Dani", release: "R", asOf: "2 Oct 2026" };
const override: RateOverride = {
  id: "00000000-0000-4000-8000-000000000301", kind: "replace", layerKey: "section_301_china", label: null, ratePercent: "0",
  amountUsd: null, reason: "Exclusion granted", engineRateText: "+25%", engineAmountUsd: "150.00", sortOrder: 0, setBy: DANI,
  setAt: "2026-10-01T09:00:00Z", changedBy: DANI, changedAt: "2026-10-01T09:00:00Z",
};
const hash = (b: string | Buffer) => createHash("sha256").update(b).digest("hex");
const pending = () => ({ ...tables(), duty_program_review_status: [reviewedStatus("section_301_forced_labor")] });
const twoOrigins = (overrides: RateOverride[] = []) =>
  workspace({ ...LOCKED_IDS, scenarios: [scenario({ items: [item({ overrides })] }), vietnamScenario()] });

async function compute(w: Workspace, t = tables()) {
  return computeWorkspaceResult(stubSupabase({ ...t, profiles: [{ id: DANI, first_name: "Dani" }] }), w, CALCULATED_ON);
}
async function stored(w: Workspace, t = tables()): Promise<SnapshotRow> {
  const built = buildSnapshotRow(w, await compute(w, t));
  if (!built.ok) throw new Error(built.error);
  return JSON.parse(JSON.stringify(built.row));
}
function asVersion1(row: SnapshotRow) {
  const v1 = JSON.parse(JSON.stringify(row));
  v1.schema_version = 1;
  for (const s of v1.inputs.scenarios) for (const i of s.items) delete i.overrides;
  for (const o of v1.result.origins) for (const k of o.skus) for (const l of k.duty.lines) delete l.manual;
  return v1;
}
function restored(row: { schema_version: unknown; inputs: unknown; result: unknown }) {
  const parsed = parseSnapshot(row);
  if (!parsed.ok) throw new Error("doesn't parse");
  return restoreSnapshot(parsed.snapshot);
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

describe("golden China with Section 301 (China) at 0%: duties $95.40, total $1,584.73", () => {
  test("the CSV shows the manual details (drafts and locked versions)", async () => {
    const w = twoOrigins([override]);
    for (const csv of [buildWorkspaceCsv(w, await compute(w)), buildWorkspaceCsv(restored(await stored(w)).workspace, restored(await stored(w)).result, LOCKED)]) {
      expect(csv).toContain("Source checked on,Last verified,Manual,Manual value,App rate,Reason,Set by,Set on");
      expect(csv).toContain(",Yes,0%,25% (150.00),Exclusion granted,Dani,2026-10-01");
      expect(csv).not.toContain("'+25%");
      expect(csv).toContain(",No,,,,,");
      expect(csv).toContain("Duties,95.40,");
      expect(csv).toContain("Total,1584.73,15.85,");
    }
  });

  test("the app's own manual cells never start with = + - @ (no guard apostrophe); typed text keeps the guard", async () => {
    const fixed = { ...override, id: "00000000-0000-4000-8000-000000000303", kind: "add" as const, layerKey: null, label: "Duty", ratePercent: null, amountUsd: "12.34", engineRateText: null, engineAmountUsd: null, reason: "=SUM(A1)" };
    const w = twoOrigins([override, fixed]);
    const csv = buildWorkspaceCsv(w, await compute(w));
    expect(csv).toContain(",Yes,0%,25% (150.00),Exclusion granted,Dani,2026-10-01");
    expect(csv).toContain(",Yes,Fixed 12.34,,'=SUM(A1),Dani,2026-10-01");
  });

  test("the PDF: the page-1 box, the Manual column, and the origin's Manual rates table", async () => {
    const r = restored(await stored(twoOrigins([override])));
    const report = buildVersionReport(versionMeta(), r);
    expect(report.manualBox).toEqual({ title: MANUAL_RATES_TITLE, lines: ["China, SKU-001: Section 301 (China), 0%. Reason: Exclusion granted"] });
    const all = await pdfText(await renderVersionPdf(report));
    expect(all).toContain("Includes manual rates");
    expect(all).toContain("China, SKU-001: Section 301 (China), 0%. Reason: Exclusion granted");
    expect(all).toMatch(/Layer Rate Amount Source Checked on Manual/);
    expect(all).toMatch(/SKU Layer Value App rate Reason Set by Set on/);
    expect(all).toMatch(/SKU-001 Section 301 \(China\) 0% \+25% \(\$150\.00\) Exclusion granted Dani Oct 1, 2026/);
    expect(all).toContain("$1,584.73");
    expect(all).toContain("Includes manual rate");
  });

  test("typed text in the PDF goes through the user-text rules", async () => {
    const w = twoOrigins([{ ...override, id: "00000000-0000-4000-8000-000000000302", kind: "add", layerKey: null, label: "反倾销 duty", ratePercent: null, amountUsd: "1.00", engineRateText: null, engineAmountUsd: null, reason: "Case → A-570" }]);
    const report = buildVersionReport(versionMeta(), restored(await stored(w)));
    expect(report.characterNote).not.toBeNull();
    expect(report.manualBox?.lines[0]).toBe("China, SKU-001: ??? duty, $1.00 fixed. Reason: Case ? A-570");
  });
});

describe("exports without manual rates are unchanged, byte for byte", () => {
  // Taken before this change (same in every timezone).
  const BEFORE = {
    golden: {
      draftCsv: "5dfed280181c2cdb2578a2d7fc843d6c2ebc94fd9ef2305af2a4872ca83b42bd",
      pdf: "fc8ac5e0dec56afbf586375bce7e53eefdf34e34506bb024877bf18442344e33",
      csv: "8d20d89b311394fcb40adcb59dd5153fad1b50af9e6ed638839ffc2940d66448",
    },
    pending: {
      draftCsv: "f98055c7beee164c090a49f418f8241d6d90e514dc42acff062571aabc673aab",
      pdf: "2ab195048182f134424d64273f7c80374fcf19affcafbd8e75b29416d1ebb0d8",
      csv: "6541ed48f75293945e1b9b4b1bdb04f15ad68f5820201e1ffca29b4a056f2b53",
    },
  };

  test.each([["golden", tables], ["pending", pending]] as const)("%s: the draft CSV, and version 2 and version 1 PDFs and CSVs", async (name, t) => {
    const w = twoOrigins();
    expect(hash(buildWorkspaceCsv(w, await compute(w, t())))).toBe(BEFORE[name].draftCsv);
    const v2 = await stored(w, t());
    for (const row of [v2, asVersion1(v2)]) {
      const r = restored(row);
      expect(hash(await renderVersionPdf(buildVersionReport(versionMeta(), r)))).toBe(BEFORE[name].pdf);
      expect(hash(buildWorkspaceCsv(r.workspace, r.result, LOCKED))).toBe(BEFORE[name].csv);
    }
  });
});

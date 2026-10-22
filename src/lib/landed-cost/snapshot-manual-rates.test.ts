import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { stubSupabase } from "@/lib/tariff/__fixtures__/supabase-stub";
import { CALCULATED_ON, reviewedStatus } from "./__fixtures__/duty-tables";
import { LOCKED_IDS, versionMeta } from "./__fixtures__/locked-version";
import { item, scenario, tables, vietnamScenario, workspace } from "./__fixtures__/workspace-builders";
import { buildWorkspaceCsv, type LockedCsv } from "./export-csv";
import { renderVersionPdf } from "./render-version-pdf";
import { computeWorkspaceResult } from "./server-compute";
import { buildSnapshotRow, moneyToCents, parseSnapshot, restoreSnapshot, SNAPSHOT_SCHEMA_VERSION, type SnapshotRow } from "./snapshot-schema";
import { buildVersionReport } from "./version-report";
import type { RateOverride, Workspace } from "./workspace-schema";

// Locked versions with manual rates (schema version 2): the manual rates in
// the inputs and each manual layer in the result, read back exactly. A
// version 1 (stored before manual rates) still parses, shows and exports
// exactly as a version 2 without them. And the database's new check (a
// SKU's duties are the sum of its layers) matches how the app counts: a
// program the app doesn't count is a warning, never a layer.

beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
afterEach(() => vi.restoreAllMocks());

const DANI = "00000000-0000-4000-8000-0000000000a1";
const override = (over: Partial<RateOverride> = {}): RateOverride => ({
  id: "00000000-0000-4000-8000-000000000301", kind: "replace", layerKey: "section_301_china", label: null, ratePercent: "0",
  amountUsd: null, reason: "Exclusion granted", engineRateText: "+25%", engineAmountUsd: "150.00", sortOrder: 0, setBy: DANI,
  setAt: "2026-10-01T09:00:00Z", changedBy: DANI, changedAt: "2026-10-01T09:00:00Z", ...over,
});

async function build(w: Workspace, t = tables()): Promise<SnapshotRow> {
  const result = await computeWorkspaceResult(stubSupabase({ ...t, profiles: [{ id: DANI, first_name: "Dani" }] }), w, CALCULATED_ON);
  const built = buildSnapshotRow(w, result);
  if (!built.ok) throw new Error(built.error);
  return JSON.parse(JSON.stringify(built.row));
}
const twoOrigins = (overrides: RateOverride[] = []) =>
  workspace({ ...LOCKED_IDS, scenarios: [scenario({ items: [item({ overrides })] }), vietnamScenario()] });

// What the app stored before manual rates: no `overrides` on items, no `manual` on layers.
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
const LOCKED: LockedCsv = { versionNo: 3, lockedOn: "2 Oct 2026", byName: "Dani", release: "R", asOf: "2 Oct 2026" };
const pdfOf = (r: ReturnType<typeof restored>) => renderVersionPdf(buildVersionReport(versionMeta(), r));

describe("schema version 2", () => {
  test("new versions are version 2, with each item's manual rates and each layer's manual details", async () => {
    const row = await build(twoOrigins([override()]));
    expect(row.schema_version).toBe(SNAPSHOT_SCHEMA_VERSION);
    expect(SNAPSHOT_SCHEMA_VERSION).toBe(2);
    expect(row.inputs.scenarios[0].items[0].overrides).toEqual([override()]);
    expect(row.inputs.scenarios[1].items[0].overrides).toEqual([]);
    const lines = row.result.origins[0].skus[0].duty.lines;
    expect(lines.map((l) => [l.code, l.amountUsd, l.manual?.kind ?? null])).toEqual([
      ["general", "20.40", null],
      ["section_301_china", "0.00", "replace"],
      ["section_301_forced_labor", "75.00", null],
    ]);
    expect(lines[1].manual).toMatchObject({ overrideId: override().id, layerName: "Section 301 (China)", setByName: "Dani", engineRateText: "+25%", engineAmountUsd: "150.00" });
    expect(row.result.origins[0]).toMatchObject({ totalUsd: "1584.73", status: { includesManualRate: true } });
    expect(row.result.origins[1].status.includesManualRate).toBe(false);
  });

  test("round trip: read back exactly, shown and exported with the manual rate marked", async () => {
    const row = await build(twoOrigins([override()]));
    const back = restored(row);
    expect(back.workspace.scenarios[0].items[0].overrides).toEqual([override()]);
    const china = back.result.state === "ready" ? back.result.scenarios[0] : null;
    if (china?.state !== "complete" || china.skus[0].status !== "ok") throw new Error("not complete");
    expect(china.skus[0].duty.lines[1].manual?.reason).toBe("Exclusion granted");
    expect(china.totals.status.includesManualRate).toBe(true);
    const csv = buildWorkspaceCsv(back.workspace, back.result, LOCKED);
    // The manual columns (a leading "+" is escaped, as every formula-like cell is).
    expect(csv).toContain("SKU-001,Section 301 (China) (Illustrative),9903.88.03,0%,0.00,Illustrative,https://example.gov/,2026-10-02,\"Duty rates last verified: Sep 20, 2026 (oldest reviewed program: Section 301 (China))\",Yes,0%,'+25% (150.00),Exclusion granted,Dani,2026-10-01");
    expect(csv).toContain("Complete; Includes manual rate");
    const report = buildVersionReport(versionMeta(), back);
    expect(report.blocks.some((b) => b.kind === "paragraph" && b.text === "Includes manual rate: each one is marked in the duty layers below.")).toBe(true);
  });
});

describe("version 1 (before manual rates)", () => {
  test("still parses, and reads back exactly as a version 2 without manual rates", async () => {
    const v2 = await build(twoOrigins());
    const v1 = asVersion1(v2);
    expect(Object.keys(v1.inputs.scenarios[0].items[0])).not.toContain("overrides");
    expect(restored(v1)).toEqual(restored(v2));
  });

  test("shows and exports exactly as before: the same PDF bytes and the same CSV", async () => {
    const v2 = await build(twoOrigins());
    const [a, b] = [restored(asVersion1(v2)), restored(v2)];
    expect((await pdfOf(a)).equals(await pdfOf(b))).toBe(true);
    const csv = buildWorkspaceCsv(a.workspace, a.result, LOCKED);
    expect(csv).toBe(buildWorkspaceCsv(b.workspace, b.result, LOCKED));
    expect(csv).not.toContain("manual");
  });

  test("version 3 doesn't exist", async () => {
    const v2 = await build(twoOrigins());
    expect(parseSnapshot({ ...v2, schema_version: 3 }).ok).toBe(false);
  });
});

describe("the database's duty sum matches the app's counting", () => {
  // As save_landed_cost_snapshot checks a version 2 row.
  const sumOk = (row: SnapshotRow) =>
    row.result.origins.every((o) =>
      o.skus.every((s) => s.duty.lines.reduce((a, l) => a + moneyToCents(l.amountUsd), BigInt(0)) === moneyToCents(s.duty.dutiesUsd)),
    );

  test("a program pending review is a warning, not a layer: the sum holds and the version can be locked", async () => {
    const pending = { ...tables(), duty_program_review_status: [reviewedStatus("section_301_forced_labor")] };
    const row = await build(twoOrigins(), pending);
    const duty = row.result.origins[0].skus[0].duty;
    expect(duty.warnings.find((w) => w.programKey === "section_301_china")).toMatchObject({ kind: "pending_review", counted: true });
    expect(duty.lines.map((l) => l.code)).not.toContain("section_301_china");
    expect(duty.dutiesUsd).toBe("95.40");
    expect(row.incomplete).toBe(true);
    expect(sumOk(row)).toBe(true);
  });

  test("with manual rates (replaced, added, and covering a pending program)", async () => {
    const pending = { ...tables(), duty_program_review_status: [reviewedStatus("section_301_forced_labor")] };
    const row = await build(
      twoOrigins([
        override({ layerKey: "base", ratePercent: "12.3456", engineRateText: "3.4%", engineAmountUsd: "20.40" }),
        override({ id: "00000000-0000-4000-8000-000000000302", kind: "add", layerKey: "section_301_china", label: "Section 301 (China)", ratePercent: "25", engineRateText: null, engineAmountUsd: null, sortOrder: 1 }),
      ]),
      pending,
    );
    const duty = row.result.origins[0].skus[0].duty;
    expect(duty.lines.map((l) => [l.code, l.amountUsd])).toEqual([["general", "74.07"], ["section_301_forced_labor", "75.00"], ["section_301_china", "150.00"]]);
    expect(duty.dutiesUsd).toBe("299.07");
    expect(sumOk(row)).toBe(true);
  });

  test("the golden case and both origins", async () => {
    expect(sumOk(await build(twoOrigins()))).toBe(true);
  });
});

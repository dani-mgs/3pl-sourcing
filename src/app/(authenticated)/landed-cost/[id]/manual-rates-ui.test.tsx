import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { stubSupabase } from "@/lib/tariff/__fixtures__/supabase-stub";
import { CALCULATED_ON, reviewedStatus } from "@/lib/landed-cost/__fixtures__/duty-tables";
import { item, scenario, tables, vietnamScenario, workspace } from "@/lib/landed-cost/__fixtures__/workspace-builders";
import { toComparisonView } from "@/lib/landed-cost/comparison-view";
import { toEditorDraft } from "@/lib/landed-cost/editor-draft";
import { manualRateList } from "@/lib/landed-cost/manual-rate-draft";
import { toResultView } from "@/lib/landed-cost/result-view";
import { computeWorkspaceResult } from "@/lib/landed-cost/server-compute";
import type { RateOverride, Workspace } from "@/lib/landed-cost/workspace-schema";
import { ComparisonArea } from "./comparison-area";
import { ManualRatesSection } from "./manual-rates-section";
import { ResultPanel, type ManualEditing } from "./result-panel";

// Manual rates as rendered: every detail for everyone, in words; the buttons
// that change them only for the owner or an admin (never a locked version,
// which renders the panel without `editing`).

beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
afterEach(() => vi.restoreAllMocks());

const DANI = "00000000-0000-4000-8000-0000000000a1";
const SAM = "00000000-0000-4000-8000-0000000000a2";
const S1 = "00000000-0000-4000-8000-000000000201";
const override = (over: Partial<RateOverride> = {}): RateOverride => ({
  id: "00000000-0000-4000-8000-000000000301", kind: "replace", layerKey: "section_301_china", label: null, ratePercent: "0",
  amountUsd: null, reason: "Exclusion granted", engineRateText: "+25%", engineAmountUsd: "150.00", sortOrder: 0, setBy: DANI,
  setAt: "2026-10-01T09:00:00Z", changedBy: SAM, changedAt: "2026-10-02T09:00:00Z", ...over,
});
const ws = (overrides: RateOverride[] = [], extra: Partial<Workspace> = {}) =>
  workspace({ scenarios: [scenario({ items: [item({ overrides })] })], ...extra });
const profiles = [{ id: DANI, first_name: "Dani" }, { id: SAM, first_name: "Sam" }];

const editing: ManualEditing = {
  onOverride: () => {}, onApplyManually: () => {}, onAddDuty: () => {}, onEdit: () => {}, onRemove: () => {},
  onKeepMyRate: () => {}, onConflict: () => {}, rowForLayer: () => null, isUnsaved: () => false,
};

async function panel(w: Workspace, edit: ManualEditing | null, t = tables()) {
  const view = toResultView(await computeWorkspaceResult(stubSupabase({ ...t, profiles }), w, CALCULATED_ON), w);
  return renderToStaticMarkup(<ResultPanel view={view} dirty={false} lastSaved="Oct 21, 2026" editing={edit} />);
}
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");

describe("entry points", () => {
  test("for the owner or an admin: Override on each app layer, Add manual duty, Apply manually on a program not counted", async () => {
    const pending = { ...tables(), duty_program_review_status: [reviewedStatus("section_301_forced_labor")] };
    const html = text(await panel(ws(), editing, pending));
    // Base duty and forced labour are applied (Section 301 (China) is pending review).
    expect(html.match(/Override /g)?.length).toBe(2);
    expect(html).toContain("Add manual duty");
    expect(html).toContain("Programs not counted");
    expect(html).toContain("Apply manually (Section 301 (China))");
    // Never on the fees.
    expect(html).not.toMatch(/Override (MPF|HMF)/);
  });

  test("read-only (another expert, or a locked version): every detail, no buttons", async () => {
    const pending = { ...tables(), duty_program_review_status: [reviewedStatus("section_301_forced_labor")] };
    const html = text(await panel(ws([override({ layerKey: "base", engineRateText: "3.4%", engineAmountUsd: "20.40" })]), null, pending));
    for (const button of ["Override", "Add manual duty", "Apply manually", "Edit", "Remove", "Keep my rate"]) expect(html).not.toContain(button);
    expect(html).toContain("Manual rate: 0% · App rate: 3.4% ($20.40)");
    expect(html).toContain("Programs not counted");
  });

  test("an app layer with a manual rate in the draft: Edit manual rate, marked not saved yet", async () => {
    const html = text(await panel(ws(), { ...editing, rowForLayer: (_, key) => (key === "base" ? { ref: "new-1", unsaved: true } : null) }));
    expect(html).toContain("Not saved yet Edit manual rate");
  });
});

describe("display, in words", () => {
  test("a manual layer: the Manual badge, the value, the app rate, the reason, who set and changed it; the origin's status", async () => {
    const html = text(await panel(ws([override()]), editing));
    expect(html).toContain("Section 301 (China) (Illustrative) Manual");
    expect(html).toContain("Manual rate: 0% · App rate: +25% ($150.00)");
    expect(html).toContain("Reason: Exclusion granted");
    expect(html).toContain("Set by Dani on Oct 1, 2026 · Changed by Sam on Oct 2, 2026");
    expect(html).toContain("Includes manual rate");
    expect(html).toContain("$1,584.73");
    expect(html).toContain("Edit the manual rate for Section 301 (China)");
  });

  test("a changed app rate: the note, with Remove (use the app's rate) and Keep my rate", async () => {
    const html = text(await panel(ws([override({ engineRateText: "+20%" })]), editing));
    expect(html).toContain("App rate changed from +20% to +25% since this override was set");
    expect(html).toContain("Remove (use the app's rate)");
    expect(html).toContain("Keep my rate");
  });

  test("a covered program says so", async () => {
    const pending = { ...tables(), duty_program_review_status: [reviewedStatus("section_301_forced_labor")] };
    const w = ws([override({ kind: "add", label: "Section 301 (China)", ratePercent: "25", engineRateText: null, engineAmountUsd: null })]);
    const html = text(await panel(w, editing, pending));
    expect(html).toContain("Covered by a manual rate.");
    expect(html).not.toContain("Apply manually (Section 301 (China))");
    expect(html).toContain("Manual duty: 25%");
  });

  test("a conflict: in the Missing list, a button that opens the fix for the owner; text for everyone else", async () => {
    const w = ws([override({ layerKey: "section_232_steel" })]);
    const msg = "SKU-001: Manual rate no longer matches a duty layer (section_232_steel). Remove it or keep it as a manual duty.";
    const edit = await panel(w, editing);
    expect(text(edit)).toContain(msg);
    expect(edit).toMatch(/<button[^>]*>SKU-001: Manual rate no longer matches a duty layer/);
    const read = await panel(w, null);
    expect(read).not.toMatch(/<button[^>]*>SKU-001: Manual rate no longer matches/);
    expect(text(read)).toContain("Manual rate to fix");
  });
});

describe("the Manual rates section", () => {
  test("listed with Edit and Remove for the owner; read-only for everyone else; counted", async () => {
    const w = ws([override()]);
    const view = toResultView(await computeWorkspaceResult(stubSupabase({ ...tables(), profiles }), w, CALCULATED_ON), w);
    const draft = toEditorDraft(w)!;
    const rows = manualRateList(draft, draft, S1, view);
    const actions = { edit: () => {}, remove: () => {}, keepMyRate: () => {}, fixConflict: () => {} };
    const html = text(renderToStaticMarkup(<ManualRatesSection rows={rows} step="5" actions={actions} overrideIdOf={() => null} />));
    expect(html).toContain("5 Manual rates (1)");
    expect(html).toContain("SKU-001 Section 301 (China) 0% Exclusion granted Set by Dani on Oct 1, 2026 Applied");
    expect(html).toContain("Edit the manual rate for Section 301 (China) on SKU-001");
    const read = text(renderToStaticMarkup(<ManualRatesSection rows={rows} step="5" actions={null} overrideIdOf={() => null} />));
    expect(read).not.toContain("Edit");
    expect(read).not.toContain("Remove");
    expect(text(renderToStaticMarkup(<ManualRatesSection rows={[]} step="E" actions={actions} overrideIdOf={() => null} />))).toContain("Manual rates (0) ");
  });
});

describe("the comparison", () => {
  test("origins with manual rates say so in the ranking and the bars; the caution names each", async () => {
    const w = workspace({ scenarios: [scenario({ items: [item({ overrides: [override()] })] }), vietnamScenario()] });
    const view = toComparisonView(await computeWorkspaceResult(stubSupabase({ ...tables(), profiles }), w, CALCULATED_ON), w);
    const html = text(renderToStaticMarkup(<ComparisonArea view={view} dirty={false} />));
    expect(html.match(/Includes manual rate/g)?.length).toBe(2);
    expect(html).toContain("Ranking may change: China: SKU-001 Section 301 (China) manual rate.");
  });
});

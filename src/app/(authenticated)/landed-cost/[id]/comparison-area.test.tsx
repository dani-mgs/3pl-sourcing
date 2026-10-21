import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { stubSupabase } from "@/lib/tariff/__fixtures__/supabase-stub";
import { CALCULATED_ON, reviewedStatus } from "@/lib/landed-cost/__fixtures__/duty-tables";
import { scenario, tables, vietnamScenario, workspace } from "@/lib/landed-cost/__fixtures__/workspace-builders";
import { toComparisonView } from "@/lib/landed-cost/comparison-view";
import { computeWorkspaceResult } from "@/lib/landed-cost/server-compute";
import type { Workspace } from "@/lib/landed-cost/workspace-schema";
import { ComparisonArea } from "./comparison-area";

// The comparison as rendered: every status and mark in words.

beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
afterEach(() => vi.restoreAllMocks());

async function render(w: Workspace, t = tables(), dirty = false): Promise<string> {
  const view = toComparisonView(await computeWorkspaceResult(stubSupabase(t), w, CALCULATED_ON), w);
  return renderToStaticMarkup(<ComparisonArea view={view} dirty={dirty} />);
}

describe("ComparisonArea", () => {
  test("ready: the verdict, the ranking, bars and per-SKU marks in words", async () => {
    const html = await render(workspace({ scenarios: [scenario(), vietnamScenario()] }));
    expect(html).toContain('data-testid="lc-verdict">China is $2.34/unit cheaper than Vietnam (11.9%).');
    expect(html).toContain("$233.85 less per shipment.");
    expect(html).toContain("Lowest landed cost");
    expect(html).toContain("Highest landed cost");
    expect(html).toContain("Baseline");
    expect(html).toContain("$2.34/unit more than the baseline (13.5%)");
    expect(html).toContain("$2.00/unit more on product ($200.00 more per shipment)");
    expect(html).toContain("As of your last save");
    expect(html).not.toContain("Unsaved changes");
  });

  test("not comparable: said in words, no verdict", async () => {
    const html = await render(workspace({ scenarios: [scenario(), vietnamScenario({ incoterm: "EXW" })] }));
    expect(html).toContain("Not comparable");
    expect(html).toContain("Incoterm EXW differs from the baseline&#x27;s FOB.");
    expect(html).not.toContain("lc-verdict");
  });

  test("an incomplete baseline and too few origins: a note, no verdict", async () => {
    const baseline = await render(workspace({ scenarios: [scenario({ freightTotalUsd: null }), vietnamScenario()] }));
    expect(baseline).toContain("The baseline (China) isn&#x27;t complete yet, so origins can&#x27;t be compared.");
    expect(baseline).toContain("Missing: Freight total (USD).");
    expect(baseline).not.toContain("lc-verdict");
    const few = await render(workspace({ scenarios: [scenario(), vietnamScenario({ freightTotalUsd: null })] }));
    expect(few).toContain("Only one origin is complete. Complete another to compare.");
  });

  test("caution, modes and unsaved changes", async () => {
    const pending = { ...tables(), duty_program_review_status: [reviewedStatus("section_301_forced_labor")] };
    const html = await render(workspace({ scenarios: [scenario(), vietnamScenario({ shipmentMode: "Air" })] }), pending, true);
    expect(html).toContain("Ranking may change: China:");
    expect(html).toContain("Different shipment modes: China by sea, Vietnam by air.");
    expect(html).toContain("Unsaved changes: save to update the comparison.");
  });

  test("one origin: nothing at all", async () => {
    expect(await render(workspace())).toBe("");
  });
});

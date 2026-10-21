import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { stubSupabase } from "@/lib/tariff/__fixtures__/supabase-stub";
import { CALCULATED_ON } from "@/lib/landed-cost/__fixtures__/duty-tables";
import { L2, skuLine, tables, workspace } from "@/lib/landed-cost/__fixtures__/workspace-builders";
import { toResultView, type ResultView } from "@/lib/landed-cost/result-view";
import { computeWorkspaceResult } from "@/lib/landed-cost/server-compute";
import type { Workspace } from "@/lib/landed-cost/workspace-schema";
import { ResultPanel } from "./result-panel";

// The result panel as rendered: the last save's figures when complete, no
// total of any kind when not, and every status in words.

beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
afterEach(() => vi.restoreAllMocks());

async function render(w: Workspace, dirty = false): Promise<string> {
  const view: ResultView = toResultView(await computeWorkspaceResult(stubSupabase(tables()), w, CALCULATED_ON), w);
  return renderToStaticMarkup(<ResultPanel view={view} dirty={dirty} lastSaved="Oct 21, 2026" />);
}

describe("ResultPanel", () => {
  test("complete: the per-unit landed cost, the total and the breakdown, as of the last save", async () => {
    const html = await render(workspace());
    expect(html).toContain('data-testid="lc-per-unit">$17.35');
    expect(html).toContain("$1,734.73");
    expect(html).toContain("Complete");
    expect(html).toContain("As of your last save (Oct 21, 2026)");
    expect(html).toContain("Formal entry, as chosen for this scenario.");
    // The golden shares add up to 99.9%.
    expect(html).toContain("Percentages are rounded.");
    expect(html).toContain("14.1%");
    expect(html).not.toContain("Unsaved changes");
  });

  test("incomplete: no total of any kind, the missing inputs as buttons, the status in words", async () => {
    const html = await render(workspace({ skuLines: [skuLine(), skuLine({ id: L2, skuCode: "SKU-002" })] }));
    expect(html).toContain("Incomplete: no total yet");
    expect(html).not.toContain("lc-per-unit");
    expect(html).not.toContain("$1,734.73");
    expect(html).not.toContain("Shipment total");
    expect(html).toContain(">SKU-002: FOB price per unit (USD)</button>");
    // SKU-001's duties still show.
    expect(html).toContain("$245.40");
  });

  test("unsaved changes are flagged: the result is still the last save's", async () => {
    expect(await render(workspace(), true)).toContain("Unsaved changes: save to update the result.");
  });

  test("an entry date out of range asks for a new one", async () => {
    const html = await render(workspace({ entryDate: "2026-09-01" }));
    expect(html).toContain("Update the entry date");
    expect(html).toContain("Change the entry date");
    expect(html).not.toContain("lc-per-unit");
  });

  test("a workspace with no scenario says so instead of failing", () => {
    const html = renderToStaticMarkup(<ResultPanel view={toResultView(null, workspace({ scenarios: [] }))} dirty={false} lastSaved="Oct 21, 2026" />);
    expect(html).toContain("This workspace has no scenario, so it can&#x27;t be calculated.");
  });

  test("an origin added since the last save: not calculated yet, named in the heading", () => {
    const html = renderToStaticMarkup(<ResultPanel view={null} dirty lastSaved="Oct 21, 2026" originLabel="Mexico" />);
    expect(html).toContain("Not calculated yet: save to see this origin&#x27;s result.");
    expect(html).toContain("· Mexico");
    expect(html).not.toContain("lc-per-unit");
  });
});

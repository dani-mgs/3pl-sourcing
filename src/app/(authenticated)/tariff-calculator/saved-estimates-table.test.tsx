import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import type { ProgramWarning } from "@/lib/tariff/programs";
import { SavedEstimatesTable, type SavedEstimateListRow } from "./saved-estimates-table";

// The Saved estimates list on the calculator page. Each row's markup is
// pinned, so a change to how a saved estimate is listed shows up here.

const warning = (overrides: Partial<ProgramWarning>): ProgramWarning => ({
  programKey: "section_301_china",
  name: "Section 301 (China)",
  text: "May apply.",
  sourceLabel: "Source",
  sourceUrl: "https://example.gov/",
  kind: "pending_review",
  hint: null,
  counted: true,
  ...overrides,
});

const row = (overrides: Partial<SavedEstimateListRow>): SavedEstimateListRow => ({
  id: "00000000-0000-4000-8000-000000000001",
  created_at: "2026-10-14T09:30:00Z",
  created_by: "user-1",
  label: "PO 1042",
  hts_code: "6402993110",
  origin_country: "VN",
  total_usd: 647.14,
  warnings: [],
  ...overrides,
});

const AUTHORS = new Map([["user-1", "Dani"]]);

// The <tr> rendered for one estimate.
function rowHtml(estimate: SavedEstimateListRow): string {
  const html = renderToStaticMarkup(<SavedEstimatesTable estimates={[estimate]} authors={AUTHORS} />);
  return html.slice(html.indexOf("<tbody>") + "<tbody>".length, html.indexOf("</tbody>"));
}

describe("Saved estimates list", () => {
  test("no estimates: the empty message", () => {
    const html = renderToStaticMarkup(<SavedEstimatesTable estimates={[]} authors={AUTHORS} />);
    expect(html).toContain("No saved estimates yet. Calculate one, then Save estimate.");
    expect(html).not.toContain("<table");
  });

  test("a complete estimate", () => {
    expect(rowHtml(row({}))).not.toContain("Incomplete estimate");
    expect(rowHtml(row({}))).toMatchInlineSnapshot(`"<tr class="border-b border-neutral-border last:border-0 hover:bg-neutral-bg"><td class="px-4 py-3 whitespace-nowrap"><a class="rounded font-medium text-move-navy hover:text-move-green hover:underline focus-visible:ring-2 focus-visible:ring-move-green focus-visible:outline-none" href="/tariff-calculator/estimates/00000000-0000-4000-8000-000000000001">Oct 14, 2026</a></td><td class="px-4 py-3">PO 1042</td><td class="px-4 py-3 whitespace-nowrap tabular-nums">6402.99.31.10</td><td class="px-4 py-3">Vietnam</td><td class="px-4 py-3 text-right"><span class="tabular-nums">$647.14</span></td><td class="px-4 py-3">Dani</td></tr>"`);
  });

  test("an estimate that leaves out two programs", () => {
    const warnings = [warning({ programKey: "a" }), warning({ programKey: "b", kind: "not_loaded" })];
    const html = rowHtml(row({ warnings }));
    // The badge, then the existing "Excludes N" text, under the amount.
    expect(html.indexOf("Incomplete estimate")).toBeGreaterThan(html.indexOf("$647.14"));
    expect(html.indexOf("Excludes 2 additional duty programs")).toBeGreaterThan(html.indexOf("Incomplete estimate"));
    expect(html).toMatchInlineSnapshot(`"<tr class="border-b border-neutral-border last:border-0 hover:bg-neutral-bg"><td class="px-4 py-3 whitespace-nowrap"><a class="rounded font-medium text-move-navy hover:text-move-green hover:underline focus-visible:ring-2 focus-visible:ring-move-green focus-visible:outline-none" href="/tariff-calculator/estimates/00000000-0000-4000-8000-000000000001">Oct 14, 2026</a></td><td class="px-4 py-3">PO 1042</td><td class="px-4 py-3 whitespace-nowrap tabular-nums">6402.99.31.10</td><td class="px-4 py-3">Vietnam</td><td class="px-4 py-3 text-right"><span class="tabular-nums">$647.14</span><span class="mt-1 flex justify-end"><span class="inline-flex items-center gap-1 rounded-full border border-[#FBBF24] bg-[#FFFBEB] px-2 py-0.5 text-xs font-semibold whitespace-nowrap text-[#92400E]" data-testid="incomplete-estimate"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-triangle-alert size-3 shrink-0" aria-hidden="true"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"></path><path d="M12 9v4"></path><path d="M12 17h.01"></path></svg>Incomplete estimate</span></span><span class="block text-xs font-medium text-[#92400E]">Excludes 2 additional duty programs</span></td><td class="px-4 py-3">Dani</td></tr>"`);
  });

  test("an estimate whose only warnings aren't counted (a note, an exempt-pending program)", () => {
    const warnings = [warning({ kind: "conditional", counted: false }), warning({ kind: "exempt_pending", counted: false })];
    expect(rowHtml(row({ warnings, label: null }))).not.toContain("Incomplete estimate");
    expect(rowHtml(row({ warnings, label: null }))).toMatchInlineSnapshot(`"<tr class="border-b border-neutral-border last:border-0 hover:bg-neutral-bg"><td class="px-4 py-3 whitespace-nowrap"><a class="rounded font-medium text-move-navy hover:text-move-green hover:underline focus-visible:ring-2 focus-visible:ring-move-green focus-visible:outline-none" href="/tariff-calculator/estimates/00000000-0000-4000-8000-000000000001">Oct 14, 2026</a></td><td class="px-4 py-3"><span class="text-neutral-muted">—</span></td><td class="px-4 py-3 whitespace-nowrap tabular-nums">6402.99.31.10</td><td class="px-4 py-3">Vietnam</td><td class="px-4 py-3 text-right"><span class="tabular-nums">$647.14</span></td><td class="px-4 py-3">Dani</td></tr>"`);
  });
});

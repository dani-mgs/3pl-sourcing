import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import type { ProgramWarning } from "@/lib/tariff/programs";
import type { EstimateResult } from "@/lib/tariff/server-estimate";
import { EstimateResultView } from "./estimate-result";

// The estimate's total as shown on the live preview and a saved estimate
// (both render EstimateResultView): an "Incomplete estimate" badge and a
// "Not final" line whenever the total leaves programs out.

const warning = (overrides: Partial<ProgramWarning>): ProgramWarning => ({
  programKey: "section_301_china",
  name: "Section 301 (China)",
  text: "China origin: Section 301 duties may apply to this product.",
  sourceLabel: "Source",
  sourceUrl: "https://example.gov/",
  kind: "pending_review",
  hint: null,
  counted: true,
  ...overrides,
});

const estimate = (warnings: ProgramWarning[], overrides: Partial<EstimateResult> = {}): EstimateResult => ({
  asOfDate: "2026-10-14",
  entryDate: "2026-10-14",
  htsCode: "6402993110",
  matchedTenDigit: false,
  description: "Other",
  ancestorDescriptions: [],
  units: [],
  specialRateText: null,
  release: { name: "2026HTSRev20", title: "Revision 20 (2026)", release_start_date: "2026-09-28" },
  originCountry: "CN",
  shipmentMode: "Sea",
  customsValueOriginal: "10000",
  currency: "USD",
  exchangeRateToUsd: "1",
  exchangeRateSource: null,
  exchangeRateDate: null,
  customsValueUsd: 10000,
  deductionUsd: null,
  rateColumn: "general",
  rateText: "6%",
  quantityUsed: null,
  baseDutyUsd: 600,
  additionalDutiesUsd: 0,
  feesUsd: 47.14,
  totalUsd: 647.14,
  lines: [
    {
      kind: "duty",
      code: "general",
      label: "Base duty (general rate)",
      rateText: "6%",
      amountUsd: 600,
      detail: null,
      sourceLabel: "HTSUS",
      sourceUrl: "https://hts.usitc.gov/",
      effectiveFrom: "2026-09-28",
    },
  ],
  warnings,
  dutyReviews: [],
  ...overrides,
});

const render = (warnings: ProgramWarning[]) => renderToStaticMarkup(<EstimateResultView estimate={estimate(warnings)} />);

describe("incomplete estimate on the total", () => {
  test("a complete estimate has no badge and no 'Not final' line", () => {
    const html = render([]);
    expect(html).not.toContain("Incomplete estimate");
    expect(html).not.toContain("Not final");
    expect(html).toContain("Estimated duties and fees (USD)");
  });

  test("one program left out: badge, singular line, and the EXCLUDES label still shown", () => {
    const html = render([warning({})]);
    expect(html).toContain('data-testid="incomplete-estimate"');
    expect(html).toContain("Incomplete estimate");
    expect(html).toContain("Not final: 1 additional duty program is not included.");
    expect(html).toContain("EXCLUDES 1 additional duty program that may apply");
  });

  test("several programs left out: plural line, with the same count as the EXCLUDES label", () => {
    const html = render([
      warning({ programKey: "a" }),
      warning({ programKey: "b", kind: "not_loaded" }),
      warning({ programKey: "c", kind: "depends_on" }),
      warning({ programKey: "d", kind: "conditional", counted: false }),
    ]);
    expect(html).toContain("Not final: 3 additional duty programs are not included.");
    expect(html).toContain("EXCLUDES 3 additional duty programs that may apply");
  });

  test("warnings that aren't counted (notes, exempt-pending) don't make it incomplete", () => {
    const html = render([warning({ kind: "conditional", counted: false }), warning({ programKey: "b", kind: "exempt_pending", counted: false })]);
    expect(html).not.toContain("Incomplete estimate");
    expect(html).not.toContain("Not final");
  });

  test("the badge says it in words, not only in colour", () => {
    const html = render([warning({})]);
    const badge = html.slice(html.indexOf('data-testid="incomplete-estimate"'));
    // The icon is decorative; the visible text is the label.
    expect(badge).toMatch(/^[^>]*>\s*<svg[^>]*aria-hidden="true"[\s\S]*?<\/svg>Incomplete estimate<\/span>/);
  });
});

describe("duty rates last verified, in the total", () => {
  const china = {
    kind: "additional" as const,
    code: "section_301_china",
    label: "Section 301 (China) (List 3)",
    rateText: "+25%",
    amountUsd: 2500,
    detail: null,
    sourceLabel: "HTS",
    sourceUrl: "https://hts.usitc.gov/",
    effectiveFrom: "2019-05-10",
  };
  const reviewed = (reviewedAt: string) =>
    ({ programKey: "section_301_china", name: "Section 301 (China)", status: "reviewed", reviewedAt, reviewedByName: "Dani", staleReason: null }) as const;
  // The line's text, tags removed.
  const lineText = (html: string) => {
    const at = html.indexOf('data-testid="last-verified"');
    return html.slice(html.indexOf(">", at) + 1, html.indexOf("</p>", at)).replace(/<!-- -->/g, "");
  };
  const lineClass = (html: string) => html.slice(html.lastIndexOf("<p", html.indexOf('data-testid="last-verified"')), html.indexOf('data-testid="last-verified"'));

  test("reviewed: the oldest counted review's date and program", () => {
    const html = renderToStaticMarkup(
      <EstimateResultView estimate={estimate([], { lines: [...estimate([]).lines, china], dutyReviews: [reviewed("2026-10-03T09:00:00+00:00")] })} />,
    );
    expect(lineText(html)).toBe("Duty rates last verified: Oct 3, 2026 (oldest reviewed program: Section 301 (China))");
    expect(lineClass(html)).toContain("text-neutral-muted");
    expect(html).not.toContain("Oldest review");
  });

  test("stale (over 30 days before the estimate): amber, with what to do", () => {
    const html = renderToStaticMarkup(
      <EstimateResultView estimate={estimate([], { lines: [...estimate([]).lines, china], dutyReviews: [reviewed("2026-09-01T09:00:00+00:00")] })} />,
    );
    expect(lineText(html)).toBe(
      "Duty rates last verified: Sep 1, 2026 (oldest reviewed program: Section 301 (China)) — over 30 days before this estimate; ask a tariff editor to review it",
    );
    expect(lineClass(html)).toContain("text-[#92400E]");
  });

  test("none counted: says so instead of a date", () => {
    expect(lineText(render([]))).toBe("No reviewed additional duties in this estimate");
  });

  test("pending programs left out: the line, the badge and the Not included list are all shown", () => {
    const html = render([warning({})]);
    expect(lineText(html)).toBe("No reviewed additional duties in this estimate");
    expect(html).toContain("Incomplete estimate");
    expect(html).toContain("Not included: Section 301 (China)");
  });
});

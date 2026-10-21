import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { reviewedStatus } from "./__fixtures__/duty-tables";
import { lockedVersion, versionMeta } from "./__fixtures__/locked-version";
import { scenario, skuLine, tables, vietnamScenario } from "./__fixtures__/workspace-builders";
import { renderVersionPdf } from "./render-version-pdf";
import { buildVersionReport, type VersionReport } from "./version-report";

// The PDF as written: read back with pdf-parse (already a dependency, as in
// render-report-pdf.test.ts), page by page. Built from locked versions read
// back from storage; the footer is on every page with the right page count,
// rows never split across pages, and the same version gives the same bytes.

beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
afterEach(() => vi.restoreAllMocks());

async function pages(buffer: Buffer): Promise<string[]> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result.pages.map((p) => p.text);
  } finally {
    await parser.destroy();
  }
}
const flat = (s: string) => s.replace(/\s+/g, " ");

async function report(over: Parameters<typeof lockedVersion>[0], meta = versionMeta(), t = tables()): Promise<VersionReport> {
  const { restored } = await lockedVersion(over, t);
  return buildVersionReport(meta, restored);
}

describe("renderVersionPdf", () => {
  test("single origin: the header on page 1, the footer on every page", async () => {
    const text = await pages(await renderVersionPdf(await report({})));
    const first = flat(text[0]);
    expect(first).toContain("Landed cost estimate");
    expect(first).toContain("Locked version v3, locked on 2 Oct 2026 by Dani");
    expect(first).toContain("Duty data as of 2 Oct 2026");
    expect(first).toContain("$1,734.73");
    text.forEach((page, i) => {
      expect(flat(page)).toContain(`Golden · v3 · Page ${i + 1} of ${text.length}`);
      expect(flat(page)).toContain("Estimate for planning only, based on duty data as of 2 Oct 2026. Rates and fees can change. Not customs or legal advice.");
    });
  });

  test("several origins: the comparison on page 1, each origin starting a new page", async () => {
    const text = await pages(await renderVersionPdf(await report({ scenarios: [scenario(), vietnamScenario()] })));
    expect(text.length).toBeGreaterThanOrEqual(3);
    expect(flat(text[0])).toContain("China is $2.34/unit cheaper than Vietnam (11.9%).");
    expect(flat(text[0])).toContain("$2.34/unit more than the baseline (13.5%)");
    const china = text.findIndex((p) => /^\s*China \(baseline\)/m.test(p));
    const vietnam = text.findIndex((p, i) => i > china && /^\s*Vietnam\s*$/m.test(p));
    expect(china).toBeGreaterThan(0);
    expect(vietnam).toBeGreaterThan(china);
  });

  test("incomplete: the banner with its reasons; not comparable: the reasons", async () => {
    const pending = { ...tables(), duty_program_review_status: [reviewedStatus("section_301_forced_labor")] };
    const incomplete = flat((await pages(await renderVersionPdf(await report({}, versionMeta({ incomplete: true }), pending))))[0]);
    expect(incomplete).toContain("Incomplete estimate: some duties or fees are not final");
    expect(incomplete).toMatch(/China: Section 301 \(China\)/);
    const notComparable = (await pages(await renderVersionPdf(await report({ scenarios: [scenario(), vietnamScenario({ incoterm: "EXW" })] })))).map(flat).join(" ");
    expect(notComparable).toContain("Vietnam: Incoterm EXW differs from the baseline's FOB.");
  });

  test("characters the font can't draw: ? in their place and one note", async () => {
    const r = await report({ skuLines: [skuLine({ description: "Mug 陶瓷杯 café" })] });
    const all = (await pages(await renderVersionPdf(r))).map(flat).join(" ");
    expect(all).toContain("Mug ??? café");
    expect(all.split("Some characters couldn't be shown in this PDF.").length - 1).toBe(1);
  });

  test("a long description wraps inside its cell instead of running off the page", async () => {
    const long = "Hand-glazed stoneware mug with a reinforced handle, packed in a recycled kraft box with a moulded pulp insert";
    const text = await pages(await renderVersionPdf(await report({ skuLines: [skuLine({ description: long })] })));
    const page = text.find((p) => p.includes("Hand-glazed"))!;
    expect(flat(page)).toContain(flat(long));
    // Wrapped: the description spans several lines of the page's text.
    expect(page.split("\n").filter((l) => /glazed|reinforced|recycled|moulded/.test(l)).length).toBeGreaterThan(1);
  });

  test("many SKUs paginate without cutting a row; the table header repeats", async () => {
    const r: VersionReport = {
      ...(await report({})),
      blocks: [
        {
          kind: "table",
          columns: [
            { header: "Start", width: 0.15 },
            { header: "Description", width: 0.7 },
            { header: "End", width: 0.15, align: "right" },
          ],
          rows: Array.from({ length: 120 }, (_, i) => {
            const n = String(i + 1).padStart(3, "0");
            return [`ROW${n}A`, `A description long enough to wrap onto a second line in this column, for row ${n}, so rows have different heights${i % 3 === 0 ? " and some have a third line of text to make them taller still" : ""}.`, `ROW${n}Z`];
          }),
        },
      ],
    };
    const text = await pages(await renderVersionPdf(r));
    expect(text.length).toBeGreaterThan(2);
    for (let i = 1; i <= 120; i++) {
      const n = String(i).padStart(3, "0");
      const start = text.findIndex((p) => p.includes(`ROW${n}A`));
      const end = text.findIndex((p) => p.includes(`ROW${n}Z`));
      expect(start, `row ${n}`).toBeGreaterThanOrEqual(0);
      expect(end, `row ${n}`).toBe(start);
    }
    for (const page of text) expect(page).toMatch(/Start\s+Description\s+End/);
  });

  test("the same version gives the same bytes (creation date from the version)", async () => {
    const r = await report({ scenarios: [scenario(), vietnamScenario()] });
    const [a, b] = [await renderVersionPdf(r), await renderVersionPdf(r)];
    expect(a.equals(b)).toBe(true);
  });
});

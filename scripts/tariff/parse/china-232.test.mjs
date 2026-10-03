import { describe, expect, test } from "vitest";
import { articleDescription, chinaExclusions, currentCodes } from "./china-301.mjs";
import { cbpMetalsList, usitcChinaTable } from "./crosscheck-sources.mjs";
import { block, listCodes, notesLines, parenItems, proseItems } from "./hts-notes.mjs";
import { note16Lists } from "./metals-232.mjs";
import { readRate, sample } from "./seed-helpers.mjs";

// Real snippets of each PR 2b source, as their text extraction gives them:
// the HTS 2026 Rev. 20 chapter 99 PDF (pdf-parse), the USITC China Tariffs
// PDF (pdf-parse) and CBP's metals list (mammoth).

const FOOT = (page, label) =>
  `Harmonized Tariff Schedule of the United States Revision 20 (2026)\nAnnotated for Statistical Reporting Purposes\nXXII\n99 - III - ${label}\n\n-- ${page} of 818 --\n\nU.S. Notes (con.)`;

const NOTE20B = `(b) Heading 9903.88.01 applies to all products of China that are classified in the following 8-digit subheadings, except products
of China granted an exclusion by the U.S. Trade Representative and provided for in: (1) heading 9903.88.05 and U.S.
note 20(h) to subchapter III of chapter 99; [Compiler's note: Only
subdivisions (vvv) and (www) are now in effect. The list of subheadings may begin on following page; read
numbers from left to right.]
${FOOT(261, 89)}
2845.90.01\t2845.40.00\t2845.30.00\t2845.20.00
8401.20.00\t8401.10.00\t4012.13.00\t4011.30.00
${FOOT(262, 90)}
(c) For the purposes of heading 9903.88.02, products of China, as provided for in this note, shall be subject to an additional`;

describe("HTS notes text", () => {
  test("drops running heads and tags each line with its PDF page and printed page", () => {
    const lines = notesLines(NOTE20B);
    expect(lines.find((l) => l.text.startsWith("2845.90.01"))).toMatchObject({ page: 262, label: "99-III-90" });
    expect(lines.find((l) => l.text.startsWith("(b) Heading"))).toMatchObject({ page: 261, label: "99-III-89" });
    expect(lines.some((l) => /Harmonized|U\.S\. Notes \(con\.\)|^-- /.test(l.text))).toBe(false);
  });

  test("list codes skip the chapter 99 cross-references in the prose", () => {
    const lines = notesLines(NOTE20B);
    const b = block(lines, "(b) Heading 9903.88.01 applies", "(c) For the purposes of heading 9903.88.02");
    const codes = listCodes(b.lines, "20(b)");
    expect(codes.map((c) => c.code)).toEqual([
      "2845.90.01", "2845.40.00", "2845.30.00", "2845.20.00", "8401.20.00", "8401.10.00", "4012.13.00", "4011.30.00",
    ]);
    expect(codes[0].location).toBe("HTS 2026 Rev. 20 ch. 99 PDF p. 262 (99-III-90), U.S. note 20(b)");
  });

  test('prose items: the covered subheading and the statistical numbers it excepts (note 20(g) item 8)', () => {
    const lines = notesLines(`8. Other seats of rubber or plastics except for other seats of reinforced or laminated plastics, provided for in
[subheading] 9401.80.40, except for such seats provided for in statistical reporting number 9401.80.4001;
${FOOT(292, 120)}
9. Other seats, provided for in [subheading] 9401.80.60, except for such seats provided for in statistical reporting
numbers 9401.80.6021 and 9401.80.6023;`);
    expect(proseItems(lines, "20(g)").map(({ n, covered, excepted }) => ({ n, covered, excepted }))).toEqual([
      { n: 8, covered: "9401.80.40", excepted: ["9401.80.4001"] },
      { n: 9, covered: "9401.80.60", excepted: ["9401.80.6021", "9401.80.6023"] },
    ]);
  });

  test("prose items: several except clauses (note 20(s)(ii) item 5)", () => {
    const lines = notesLines(`5. Other made-up articles of textile materials, provided for in subheading 6307.90.98, except for respirators of
textiles, described in statistical reporting numbers 6307.90.9842, 6307.90.9844 or 6307.90.9850, and except
for face masks of textiles, described in statistical reporting numbers 6307.90.9870 or 6307.90.9875.`);
    expect(proseItems(lines, "20(s)(ii)")[0].excepted).toEqual(["6307.90.9842", "6307.90.9844", "6307.90.9850", "6307.90.9870", "6307.90.9875"]);
  });

  test("numbered items span lines", () => {
    const lines = notesLines(`(4) Diamond wire saws designed for cutting or slicing square or rectangular monocrystalline silicon ingots (boules)
of an initial mass exceeding 400 kg into solar wafers of a thickness not exceeding 200 micrometers (described
in statistical reporting number 8486.10.0000)
(5) 8486.20.0000`);
    const items = parenItems(lines);
    expect(items.map((i) => i.n)).toEqual([4, 5]);
    expect(items[0].text).toMatch(/^Diamond wire saws .* micrometers \(described in statistical reporting number 8486\.10\.0000\)$/);
    expect(items[1].text).toBe("8486.20.0000");
  });
});

describe("China exclusions", () => {
  test("only the statistical numbers in force today count", () => {
    expect(
      currentCodes(
        "Pump casings and bodies (described in statistical reporting number 8413.91.9080 prior to January 1, 2019; described in statistical reporting number 8413.91.9095 effective January 1, 2019 through December 31, 2019; described in statistical reporting number 8413.91.9085 or 8413.91.9096 effective January 1, 2020 through June 30, 2026; described in statistical reporting numbers 8413.91.9039, 8413.91.9046, 8413.91.9059 or 8413.91.9099 effective July 1, 2026)",
      ),
    ).toEqual(["8413.91.9039", "8413.91.9046", "8413.91.9059", "8413.91.9099"]);
    expect(currentCodes("3926.90.9910 prior to July 1, 2026; described in statistical reporting numbers 3926.90.9915 or 3926.90.9920 effective July 1, 2026")).toEqual([
      "3926.90.9915",
      "3926.90.9920",
    ]);
    expect(currentCodes("8483.50.9040")).toEqual(["8483.50.9040"]);
  });

  test("the article description is the text before the classification", () => {
    expect(articleDescription("Rolls of polyethylene film coated with a solvent acrylic adhesive (described in statistical reporting number 3919.10.2055)")).toBe(
      "Rolls of polyethylene film coated with a solvent acrylic adhesive",
    );
    expect(articleDescription("8483.50.9040")).toBeNull();
  });

  test('(www) ends at note 21, which Revision 20 prints as "(21)(a)"', () => {
    const intro = (sub, heading) =>
      `${sub} The U.S. Trade Representative determined to establish a process by which particular products classified in heading\n${heading} could be excluded. Pursuant to the product exclusion process:`;
    const text = [
      "20. (a) For the purposes of heading 9903.88.01, products of China, as provided for in this note, shall be subject to an additional",
      intro("(vvv) (i)", "9903.88.01"),
      "(1) 8483.50.9040",
      "(2) 8607.21.1000",
      intro("(ii)", "9903.88.02"),
      "(1) 9025.19.8010",
      intro("(iii)", "9903.88.03"),
      "(1) 0304.72.5000",
      intro("(iv)", "9903.88.15"),
      "(4) 3926.90.9910 prior to July 1, 2026; described in statistical reporting numbers 3926.90.9915 or 3926.90.9920",
      "effective July 1, 2026",
      intro("(www)", "9903.88.02"),
      "(14) Machines designed for lifting, handling, loading, or unloading of solar wafers of a thickness not exceeding 200",
      "micrometers, for use in solar wafer manufacturing (described in statistical reporting number 8486.40.0030)",
      "(21)(a) Except as provided in notes 21(u), 21(v), 21(w) and 21(x) of this subdivision, for the purposes of subheadings 9903.89.05",
      "(b) The duty rates in note 21 …",
      "(1) 0403.90.85",
    ].join("\n");
    const items = chinaExclusions(notesLines(text));
    expect(items.map((i) => [i.ref, i.n, i.heading, i.codes])).toEqual([
      ["20(vvv)(i)", 1, "9903.88.69", ["8483.50.9040"]],
      ["20(vvv)(i)", 2, "9903.88.69", ["8607.21.1000"]],
      ["20(vvv)(ii)", 1, "9903.88.69", ["9025.19.8010"]],
      ["20(vvv)(iii)", 1, "9903.88.69", ["0304.72.5000"]],
      ["20(vvv)(iv)", 4, "9903.88.69", ["3926.90.9915", "3926.90.9920"]],
      ["20(www)", 14, "9903.88.70", ["8486.40.0030"]],
    ]);
  });
});

describe("Section 232 note 16 lists", () => {
  test("headings, 6-, 8- and 10-digit codes by subdivision", () => {
    const subs = ["(i) Articles of aluminum:", "(ii) Derivative aluminum articles:", "(iii) Articles of steel:", "(iv) Derivative steel articles:", "(v) Articles of copper:", "(vi) Derivative aluminum articles:", "(vii) Derivative steel articles: [Compiler’s note: List may begin on a subsequent page; read numbers from left to", "(viii) Articles of copper:", "(ix) Derivative aluminum articles:", "(x) Derivative steel articles:", "(xi) Derivative steel articles:"];
    const text = [
      "16. (a) Except as provided in headings 9903.82.01, 9903.85.67, and 9903.85.68, headings 9903.82.02–9903.82.26 provide the",
      subs[0],
      "7606\t7605\t7604\t7601",
      "7616.99.5160\t7609\t7608\t7607",
      "7616.99.5170",
      FOOT(236, 64),
      subs[1],
      "7612.10.00\t7610.90.00\t7610.10.00\t7308.20.0035",
      subs[2],
      "7302.10\t7301.10.00",
      ...subs.slice(3).flatMap((s, i) => [s, `84${String(10 + i)}.10.00`]),
      "(d) Headings 9903.82.04 and 9903.82.05 apply to articles the product of the United Kingdom in which at least 95 percent of",
    ].join("\n");
    const lists = note16Lists(notesLines(text));
    expect(lists.i.map((c) => c.code)).toEqual(["7606", "7605", "7604", "7601", "7616.99.5160", "7609", "7608", "7607", "7616.99.5170"]);
    expect(lists.ii.map((c) => c.prefix)).toEqual(["76121000", "76109000", "76101000", "7308200035"]);
    expect(lists.iii.map((c) => c.prefix)).toEqual(["730210", "73011000"]);
    expect(lists.xi.map((c) => c.code)).toEqual(["8417.10.00"]);
    expect(lists.i[0].location).toBe("HTS 2026 Rev. 20 ch. 99 PDF p. 236 (99-III-64), U.S. note 16(c)(i)");
  });
});

describe("cross-check sources", () => {
  test("USITC China Tariffs rows and heading dates", () => {
    const text = `China Tariffs
(Last Updated January 1, 2026)
For reference, heading 9903.88.01 became effective on July 6, 2018; heading 9903.88.02 became
effective on August 23, 2018; headings 9903.91.06, 9903.91.07, and 9903.91.08 became effective on January 1, 2026.

-- 1 of 245 --

9620.00.70 \t9903.88.03
9701.21.00 \t9903.88.15
6307.90.9842 \t9903.91.07`;
    const parsed = usitcChinaTable(text);
    expect(parsed.rows.map((r) => [r.code, r.heading, r.location])).toEqual([
      ["9620.00.70", "9903.88.03", "USITC China Tariffs (Jan 1, 2026) PDF p. 2"],
      ["9701.21.00", "9903.88.15", "USITC China Tariffs (Jan 1, 2026) PDF p. 2"],
      ["6307.90.9842", "9903.91.07", "USITC China Tariffs (Jan 1, 2026) PDF p. 2"],
    ]);
    expect(parsed.effective).toMatchObject({ "9903.88.01": "July 6, 2018", "9903.88.02": "August 23, 2018", "9903.91.07": "January 1, 2026" });
  });

  test("CBP metals list sections and subsections", () => {
    const text = ` Metals HTS List

9903.82.02:

Articles of aluminum:

7601\t7604\t7616.99.5160

9903.82.14 (Russia):

(iii)      Articles of steel:

7206\t7207

    (iv)        Derivative steel articles :

7216.91.0010\t7301.20.10

9903.82.23, 9903.82.24, 9903.82.25, 9903.82.26: Except for 9903.85.68,

Articles of copper:

8544.42.10\t8544.42.20`;
    const sections = cbpMetalsList(text);
    expect(sections.map((s) => [s.headings, s.subs.map((x) => [x.roman, x.codes])])).toEqual([
      [["9903.82.02"], [[null, ["7601", "7604", "7616.99.5160"]]]],
      [["9903.82.14"], [["iii", ["7206", "7207"]], ["iv", ["7216.91.0010", "7301.20.10"]]]],
      [["9903.82.23", "9903.82.24", "9903.82.25", "9903.82.26"], [[null, ["8544.42.10", "8544.42.20"]]]],
    ]);
  });
});

describe("helpers", () => {
  test("rate texts of chapter 99 headings", () => {
    expect(readRate("The duty provided in the applicable subheading + 25%")).toMatchObject({ type: "add", pct: "25" });
    expect(readRate("The duty provided in the applicable subheading plus 25%")).toMatchObject({ type: "add", pct: "25" });
    expect(readRate("The duty provided in the applicable subheading + a duty of 25%")).toMatchObject({ type: "add", pct: "25" });
    expect(readRate("The duty provided inthe applicable subheading+ 25%")).toMatchObject({ type: "add", pct: "25" });
    expect(readRate("15%")).toMatchObject({ type: "total", pct: "15" });
    expect(readRate("No change")).toMatchObject({ type: "none" });
    expect(readRate("The duty provided in the applicable subheading")).toMatchObject({ type: "none" });
  });

  test("the spot-check sample is the same every time for the same list", () => {
    const pool = Array.from({ length: 100 }, (_, i) => ({ prefix: String(1000 + i) }));
    expect(sample(pool, 5, "List 1")).toEqual(sample(pool, 5, "List 1"));
    expect(sample(pool, 5, "List 1")).not.toEqual(sample(pool, 5, "List 3"));
    expect(sample(pool.slice(0, 3), 5, "small")).toHaveLength(3);
  });
});

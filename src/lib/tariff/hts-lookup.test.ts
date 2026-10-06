import { describe, expect, test } from "vitest";
import {
  MAX_QUERY_LENGTH,
  buildBrowseTree,
  buildPath,
  canUseInCalculator,
  crossRulingsUrl,
  generalRateDisplay,
  groupByHeading,
  mayApplyLabel,
  parseLookupQuery,
  parseLookupRows,
  releaseLabel,
  type BrowseNode,
  type LookupLine,
} from "./hts-lookup";

const HEADING = "Other footwear with outer soles and uppers of rubber or plastics:";

function line(code: string, description: string, ancestors: string[], extra: Partial<LookupLine> = {}): LookupLine {
  return {
    hts_code: code,
    indent: ancestors.length,
    description,
    ancestor_descriptions: ancestors,
    units: [],
    general_rate: null,
    rate_from_code: null,
    has_children: false,
    parents: [],
    may_apply: [],
    total_count: 1,
    ...extra,
  };
}

describe("parseLookupQuery", () => {
  test("digits, with or without dots, spaces or dashes, are a code", () => {
    expect(parseLookupQuery("6402")).toEqual({ kind: "code", digits: "6402" });
    expect(parseLookupQuery("6402.99")).toEqual({ kind: "code", digits: "640299" });
    expect(parseLookupQuery("640299")).toEqual({ kind: "code", digits: "640299" });
    expect(parseLookupQuery(" 6402 99 31-60 ")).toEqual({ kind: "code", digits: "6402993160" });
    expect(parseLookupQuery("64")).toEqual({ kind: "code", digits: "64" });
  });

  test("a code must have 2 to 10 digits", () => {
    expect(parseLookupQuery("6")).toMatchObject({ kind: "invalid" });
    expect(parseLookupQuery("6402.99.31.60.1")).toMatchObject({ kind: "invalid" });
    expect(parseLookupQuery("...")).toMatchObject({ kind: "invalid" });
  });

  test("words are keywords: lowercased, letters and digits only, de-duplicated", () => {
    expect(parseLookupQuery("Rubber footwear")).toEqual({ kind: "keywords", terms: ["rubber", "footwear"] });
    expect(parseLookupQuery("men's  shoes, rubber-soled")).toEqual({
      kind: "keywords",
      terms: ["men", "s", "shoes", "rubber", "soled"],
    });
    expect(parseLookupQuery("Crème brûlée")).toEqual({ kind: "keywords", terms: ["creme", "brulee"] });
    expect(parseLookupQuery("cotton COTTON 100")).toEqual({ kind: "keywords", terms: ["cotton", "100"] });
  });

  test("query syntax can't get through", () => {
    expect(parseLookupQuery("foot:* | wear & !x")).toEqual({ kind: "keywords", terms: ["foot", "wear", "x"] });
    expect(parseLookupQuery("'; drop table hts_lines; --")).toEqual({
      kind: "keywords",
      terms: ["drop", "table", "hts", "lines"],
    });
    expect(parseLookupQuery("?!*")).toMatchObject({ kind: "invalid" });
  });

  test("empty, too long, too many words", () => {
    expect(parseLookupQuery("   ")).toEqual({ kind: "empty" });
    expect(parseLookupQuery(undefined)).toEqual({ kind: "empty" });
    expect(parseLookupQuery(["6402"])).toEqual({ kind: "empty" });
    expect(parseLookupQuery("a".repeat(MAX_QUERY_LENGTH + 1))).toEqual({
      kind: "invalid",
      error: "Keep the search under 100 characters.",
    });
    expect(parseLookupQuery("a b c d e f g h i")).toEqual({ kind: "invalid", error: "Use up to 8 words." });
    expect(parseLookupQuery("x".repeat(41))).toMatchObject({ kind: "invalid" });
  });
});

describe("buildPath", () => {
  test("chapter → heading → subheading → unnumbered rows → line", () => {
    const steps = buildPath(
      line("6402993160", "Other", [HEADING, "Other:", "For women"], {
        parents: [
          { code: "640299", description: "Other:" },
          { code: "6402", description: HEADING },
        ],
      }),
    );
    expect(steps).toEqual([
      { code: "64", description: "Chapter 64" },
      { code: "6402", description: HEADING },
      { code: "640299", description: "Other:" },
      { code: null, description: "For women" },
      { code: "6402993160", description: "Other" },
    ]);
  });

  test("an unnumbered row with the same words as a later parent doesn't take its code", () => {
    const steps = buildPath(
      line("6402991000", "Other", [HEADING, "Other:", "Other:"], {
        parents: [
          { code: "6402", description: HEADING },
          { code: "640299", description: "Other:" },
        ],
      }),
    );
    expect(steps.map((s) => s.code)).toEqual(["64", "6402", "640299", null, "6402991000"]);
  });

  test("a heading's path is its chapter and itself", () => {
    expect(buildPath(line("6402", HEADING, []))).toEqual([
      { code: "64", description: "Chapter 64" },
      { code: "6402", description: HEADING },
    ]);
  });
});

describe("buildBrowseTree", () => {
  const shape = (nodes: BrowseNode[]): unknown[] =>
    nodes.map((n) => (n.children.length ? { [n.code ?? n.description]: shape(n.children) } : n.code ?? n.description));

  test("rebuilds unnumbered rows from ancestor descriptions, in code order", () => {
    const lines = [
      line("6402993160", "Other", [HEADING, "Other:", "For women"]),
      line("6402", HEADING, [], { has_children: true }),
      line("640299", "Other:", [HEADING], { has_children: true }),
      line("6402993110", "House slippers", [HEADING, "Other:", "For women"]),
      line("6402994000", "Other", [HEADING, "Other:"]),
      line("640212", "Ski-boots", [HEADING], { has_children: true }),
      line("6402120000", "Ski-boots", [HEADING, "Ski-boots"]),
    ];
    expect(shape(buildBrowseTree(lines))).toEqual([
      {
        "6402": [
          { "640212": ["6402120000"] },
          { "640299": [{ "For women": ["6402993110", "6402993160"] }, "6402994000"] },
        ],
      },
    ]);
  });

  test("two unnumbered rows with the same words under one parent stay separate", () => {
    const lines = [
      line("7208", "Flat-rolled:", []),
      line("7208100000", "A", ["Flat-rolled:", "Other:"]),
      line("7208200000", "B", ["Flat-rolled:", "In coils:"]),
      line("7208300000", "C", ["Flat-rolled:", "Other:"]),
    ];
    const tree = buildBrowseTree(lines);
    expect(shape(tree)).toEqual([{ "7208": [{ "Other:": ["7208100000"] }, { "In coils:": ["7208200000"] }, { "Other:": ["7208300000"] }] }]);
    const ids = tree[0].children.map((n) => n.id);
    expect(new Set(ids).size).toBe(3);
  });
});

describe("groupByHeading", () => {
  test("groups by the first four digits in code order, named by the heading line or parent", () => {
    const groups = groupByHeading([
      line("6403990000", "Other", ["Footwear, leather:"], { parents: [{ code: "6403", description: "Footwear, leather:" }] }),
      line("6402", HEADING, []),
      line("6402993160", "Other", [HEADING]),
    ]);
    expect(groups.map((g) => [g.heading, g.description, g.lines.map((l) => l.hts_code)])).toEqual([
      ["6402", HEADING, ["6402", "6402993160"]],
      ["6403", "Footwear, leather:", ["6403990000"]],
    ]);
  });
});

describe("display", () => {
  test("only leaf 8- or 10-digit lines outside chapters 98 and 99 go to the calculator", () => {
    expect(canUseInCalculator({ hts_code: "6402993160", has_children: false })).toBe(true);
    expect(canUseInCalculator({ hts_code: "84714101", has_children: false })).toBe(true);
    expect(canUseInCalculator({ hts_code: "64029931", has_children: true })).toBe(false);
    expect(canUseInCalculator({ hts_code: "640299", has_children: false })).toBe(false);
    expect(canUseInCalculator({ hts_code: "9903880100", has_children: false })).toBe(false);
    expect(canUseInCalculator({ hts_code: "98020040", has_children: false })).toBe(false);
  });

  test("may-apply badges name a few origins, never amounts", () => {
    expect(mayApplyLabel({ key: "section_301_china", name: "Section 301 (China)", origins: ["CN"] })).toBe(
      "Section 301 (China) may apply · if from China",
    );
    expect(mayApplyLabel({ key: "x", name: "X", origins: ["CA", "MX"] })).toBe("X may apply · if from Canada or Mexico");
    expect(mayApplyLabel({ key: "section_232_metals", name: "Section 232", origins: null })).toBe("Section 232 may apply");
    expect(mayApplyLabel({ key: "x", name: "X", origins: ["AR", "AT", "BE", "BG"] })).toBe("X may apply");
  });

  test("general rate parsed as in the calculator", () => {
    expect(generalRateDisplay({ hts_code: "6402993160", general_rate: "6%", rate_from_code: "64029931" })).toEqual({
      text: "6%",
      calculable: true,
      fromCode: "6402.99.31",
    });
    expect(generalRateDisplay({ hts_code: "0101210010", general_rate: "Free", rate_from_code: "0101210010" })).toEqual({
      text: "Free",
      calculable: true,
      fromCode: null,
    });
    expect(
      generalRateDisplay({ hts_code: "2009", general_rate: "The rate applicable to the natural juice", rate_from_code: "2009" }),
    ).toMatchObject({ calculable: false });
    expect(generalRateDisplay({ hts_code: "6402", general_rate: null, rate_from_code: null })).toBeNull();
  });

  test("release label", () => {
    expect(releaseLabel({ name: "2026HTSRev20", title: "Revision 20 (2026)" })).toBe("2026 Rev. 20");
    expect(releaseLabel({ name: "2026HTSBasic", title: null })).toBe("2026 Basic edition");
    expect(releaseLabel({ name: "Other1", title: "Something" })).toBe("Something");
  });

  test("rows from the database are validated", () => {
    const row = {
      ...line("6402993160", "Other", [HEADING]),
      units: null,
      total_count: "12",
    };
    expect(parseLookupRows([row])[0]).toMatchObject({ units: [], total_count: 12 });
    expect(() => parseLookupRows([{ ...row, hts_code: "64.02" }])).toThrow();
  });
});

describe("links", () => {
  test("CROSS rulings search for a heading", () => {
    expect(crossRulingsUrl("6402")).toBe("https://rulings.cbp.gov/search?term=6402");
  });
});

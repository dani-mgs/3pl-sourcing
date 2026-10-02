import { describe, expect, test } from "vitest";
import {
  HTS_CHAPTERS,
  buildHtsLines,
  chapter99Digest,
  chapterExportUrl,
  checkImportSanity,
  plainText,
  type ChapterCounts,
} from "./hts-import";
import sample from "./__fixtures__/hts-export-sample-2026-rev20.json";

const byCode = (chapter: string, body: unknown) => {
  const built = buildHtsLines(chapter, body);
  if (!built.ok) throw new Error(built.error);
  return new Map(built.lines.map((l) => [l.hts_code, l]));
};

describe("chapterExportUrl", () => {
  test("asks for one chapter's headings", () => {
    expect(chapterExportUrl("01")).toBe(
      "https://hts.usitc.gov/reststop/exportList?from=0100&to=0200&format=JSON&styles=false",
    );
    expect(chapterExportUrl("72")).toContain("from=7200&to=7300");
    expect(chapterExportUrl("99")).toContain("from=9900&to=9999");
  });

  test("covers chapters 01–99", () => {
    expect(HTS_CHAPTERS).toHaveLength(99);
    expect(HTS_CHAPTERS[0]).toBe("01");
    expect(HTS_CHAPTERS[98]).toBe("99");
  });
});

describe("buildHtsLines on real Revision 20 rows", () => {
  test("10-digit lines take the 8-digit line's rates (0805.10.00 oranges)", () => {
    const lines = byCode("08", sample["08"]);
    const parent = lines.get("08051000")!;
    expect(parent.general_rate).toBe("1.9¢/kg");
    expect(parent.other_rate).toBe("2.2¢/kg");
    expect(parent.rate_from_code).toBe("08051000");
    const temple = lines.get("0805100020")!;
    expect(temple.description).toBe("Temple oranges");
    expect(temple.general_rate).toBe("1.9¢/kg");
    expect(temple.special_rate).toBe(parent.special_rate);
    expect(temple.other_rate).toBe("2.2¢/kg");
    expect(temple.rate_from_code).toBe("08051000");
    expect(temple.units).toEqual(["kg"]);
    expect(temple.ancestor_descriptions.at(-1)).toBe("Oranges");
  });

  test("lines under an unnumbered 'Other:' row keep their own rates and context (7208.10)", () => {
    const lines = byCode("72", sample["72"]);
    const pickled = lines.get("7208101500")!;
    expect(pickled.general_rate).toBe("Free");
    expect(pickled.other_rate).toBe("0.4¢/kg + 20%");
    const thick = lines.get("7208103000")!;
    expect(thick.general_rate).toBe("Free");
    expect(thick.other_rate).toBe("20%");
    expect(thick.ancestor_descriptions).toContain("Other:");
    expect(thick.footnotes[0]).toMatchObject({ columns: ["other"], value: "See 9903.90.09." });
  });

  test("a 10-digit line with no 8-digit parent carries its own rate (8471.30.01.00)", () => {
    const lines = byCode("84", sample["84"]);
    expect(lines.has("84713001")).toBe(false);
    expect(lines.get("8471300100")).toMatchObject({ general_rate: "Free", rate_from_code: "8471300100" });
  });

  test("headings without a rate are stored with no rate", () => {
    const lines = byCode("72", sample["72"]);
    expect(lines.get("7208")).toMatchObject({ general_rate: null, other_rate: null, rate_from_code: null });
  });
});

describe("buildHtsLines validation", () => {
  const row = (overrides: Record<string, unknown> = {}) => ({
    htsno: "0101.21.00",
    indent: "1",
    description: "Purebred breeding animals",
    units: ["No."],
    general: "Free",
    special: "",
    other: "Free",
    footnotes: [],
    ...overrides,
  });

  test("strips markup from descriptions", () => {
    const lines = byCode("01", [row({ description: "Of teak (<u>Tectona</u> spp.) &amp; other" })]);
    expect(lines.get("01012100")!.description).toBe("Of teak (Tectona spp.) & other");
    expect(plainText("<i>ad valorem</i>")).toBe("ad valorem");
  });

  test("rejects a malformed export whole", () => {
    expect(buildHtsLines("01", { not: "an array" }).ok).toBe(false);
    expect(buildHtsLines("01", [row({ indent: "deep" })]).ok).toBe(false);
  });

  test("rejects rows from another chapter or repeated numbers", () => {
    expect(buildHtsLines("01", [row({ htsno: "0201.10.00" })]).ok).toBe(false);
    expect(buildHtsLines("01", [row(), row()]).ok).toBe(false);
  });
});

describe("chapter99Digest", () => {
  test("changes when a heading's rate or text changes", () => {
    const lines = byCode("72", sample["72"]);
    const all = [...lines.values()];
    const digest = chapter99Digest(all);
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(chapter99Digest(all)).toBe(digest);
    const changed = all.map((l, i) => (i === 2 ? { ...l, general_rate: "25%" } : l));
    expect(chapter99Digest(changed)).not.toBe(digest);
  });
});

describe("checkImportSanity", () => {
  const full = (perChapter: number): ChapterCounts =>
    Object.fromEntries(HTS_CHAPTERS.map((c) => [c, c === "77" ? 0 : perChapter]));

  test("accepts a complete import", () => {
    expect(checkImportSanity(full(310), null)).toEqual({ ok: true });
    expect(checkImportSanity(full(310), full(305))).toEqual({ ok: true });
  });

  test("refuses an empty chapter (other than 77)", () => {
    const counts = { ...full(310), "84": 0 };
    expect(checkImportSanity(counts, null)).toMatchObject({ ok: false, error: "Chapter 84 has no lines." });
  });

  test("refuses an import too small to be the whole schedule", () => {
    expect(checkImportSanity(full(100), null).ok).toBe(false);
  });

  test("refuses a big drop against the current release", () => {
    expect(checkImportSanity(full(310), full(400)).ok).toBe(false);
    const truncated = { ...full(320), "84": 150 };
    expect(checkImportSanity(truncated, full(320))).toMatchObject({ ok: false });
  });
});

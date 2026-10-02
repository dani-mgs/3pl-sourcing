import { describe, expect, test } from "vitest";
import { federalRegisterText } from "../lib/text.mjs";
import { note52Text, particulars } from "./origin-301.mjs";

// Real snippets of FR 2026-15181 (U.S. note 52), as served by
// federalregister.gov/documents/full_text/text/2026/07/28/2026-15181.txt.

describe("federalRegisterText", () => {
  test("drops tags and page markers and joins wrapped lines", () => {
    const html = `<pre>BILLING CODE 3390-F4-C
    2. The following new U.S. note 52 is inserted in numerical order:
    \`\`52. (a) Except as provided in headings 9903.05.85-9903.06.21 and
in subdivisions (b) through (k) of this note,

[[Page 47353]]

and other</pre>`;
    expect(federalRegisterText(html)).toBe(
      "BILLING CODE 3390-F4-C 2. The following new U.S. note 52 is inserted in numerical order: ``52. (a) Except as provided in headings 9903.05.85-9903.06.21 and in subdivisions (b) through (k) of this note, and other",
    );
  });
});

describe("note52Text", () => {
  test("slices from the note's opening quote to its last amendment", () => {
    const text =
      "inserted in numerical order: ``52. (a) Except as provided ... c. by inserting the following new item (8) in numerical order: ``(8) patented pharmaceutical articles provided for in headings 9903.04.60-9903.04.66.'' [FR Doc. 2026-15181 Filed]";
    expect(note52Text(text)).toBe(
      "``52. (a) Except as provided ... c. by inserting the following new item (8) in numerical order: ``(8) patented pharmaceutical articles provided for in headings 9903.04.60-9903.04.66.''",
    );
  });

  test("fails loudly when the note isn't there", () => {
    expect(() => note52Text("no note here")).toThrow("U.S. note 52 not found");
  });
});

describe("particulars", () => {
  test("numbered articles of note 52(c)", () => {
    const text =
      "(c) As provided in heading 9903.05.87, the duties imposed by headings 9903.05.20-9903.05.84 shall not apply to the following particular articles: (1) Etrogs (classifiable in subheading 0805.90.01); (2) Tropical fruit, nesoi, frozen, whether or not previously steamed or boiled (classifiable in subheading 0811.90.80); (3) Castor oil seeds, for sowing (classifiable in subheading 1207.30.00);";
    expect(particulars(text)).toEqual([
      { prefix: "08059001", description: "Etrogs" },
      { prefix: "08119080", description: "Tropical fruit, nesoi, frozen, whether or not previously steamed or boiled" },
      { prefix: "12073000", description: "Castor oil seeds, for sowing" },
    ]);
  });

  test("lettered articles of note 52(j)(ii)", () => {
    const text =
      "As provided in heading 9903.06.21, the duty imposed by heading 9903.05.50 shall not apply to the following particular articles the product of Jordan: (A) Psyllium seed husks (classifiable in subheading 1211.90.89); and (B) Aloe, Tasmanian pepper, coconut and centella (classifiable in subheading 1302.19.91).";
    expect(particulars(text)).toEqual([
      { prefix: "12119089", description: "Psyllium seed husks" },
      { prefix: "13021991", description: "Aloe, Tasmanian pepper, coconut and centella" },
    ]);
  });
});

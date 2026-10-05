import { describe, expect, test } from "vitest";
import { compactSourceLabel } from "./source-label";

describe("compactSourceLabel", () => {
  test.each([
    ["HTS heading 9903.88.01 and U.S. note 20(a)-(b) (2026 Rev. 20)", "HTS 9903.88.01 · note 20(a)–(b) · Rev. 20"],
    ["HTS subheading 9903.92.10 (2026 Rev. 20)", "HTS 9903.92.10 · Rev. 20"],
    [
      "HTS heading 9903.88.69 and U.S. note 20(vvv) (2026 Rev. 20); extended through November 9, 2026 (FR 2025-21671)",
      "HTS 9903.88.69 · note 20(vvv) · Rev. 20",
    ],
    [
      "HTS heading 9903.82.06 and U.S. note 16(c)(ii), (iv), (vi)-(viii), (xi), (e) (2026 Rev. 20); Proclamation 11021 as adjusted June 8, 2026",
      "HTS 9903.82.06 · note 16(c)(ii), (iv), (vi)–(viii), (xi), (e) · Rev. 20",
    ],
    ["HTS headings 9903.82.20-.21 and U.S. note 16(j) (2026 Rev. 20)", "HTS 9903.82.20–.21 · note 16(j) · Rev. 20"],
    // PR 2a labels: the FR document number keeps its hyphen.
    ["U.S. note 52(j), FR 2026-15181", "note 52(j) · FR 2026-15181"],
    [
      "HTS heading 9903.05.20 (2026 Rev. 20) and U.S. note 52(a), FR 2026-15181",
      "HTS 9903.05.20 · note 52(a) · Rev. 20 · FR 2026-15181",
    ],
    [
      "HTS headings 9903.05.38/9903.05.39 and U.S. note 52(k), FR 2026-15181",
      "HTS 9903.05.38/9903.05.39 · note 52(k) · FR 2026-15181",
    ],
    ["HTS heading 9903.82.22 (2026 Rev. 20)", "HTS 9903.82.22 · Rev. 20"],
  ])("%s", (label, compact) => {
    expect(compactSourceLabel(label)).toBe(compact);
  });

  test("a label typed by an editor in another form is kept, tidied", () => {
    expect(compactSourceLabel("  CBP CSMS #68855869   (June 2026) ")).toBe("CBP CSMS #68855869 (June 2026)");
  });
});

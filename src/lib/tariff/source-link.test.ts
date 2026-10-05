import { describe, expect, test } from "vitest";
import { describeSourceLink, sourceLinkText } from "./source-link";

describe("describeSourceLink", () => {
  test.each([
    ["https://hts.usitc.gov/search?query=9903.88.01", "HTS website: 9903.88.01 (web page)"],
    [
      "https://www.federalregister.gov/documents/2026/07/28/2026-15181/notice-of-actions-in-section-301-investigations",
      "Federal Register 2026-15181 (web page)",
    ],
    ["https://www.federalregister.gov/d/2025-21671", "Federal Register 2025-21671 (web page)"],
    ["https://www.govinfo.gov/content/pkg/FR-2022-06-30/pdf/2022-14145.pdf", "govinfo.gov (PDF)"],
    ["https://learning.usitc.gov/hts-docs/documents/China%20Tariffs.pdf", "learning.usitc.gov (PDF)"],
    ["https://www.cbp.gov/trade/programs-administration/trade-remedies", "CBP (web page)"],
    ["https://ustr.gov/issue-areas/enforcement/section-301-investigations", "USTR (web page)"],
    ["https://example.org/list.docx", "example.org (download)"],
    ["https://www.ecfr.gov/current/title-19/section-24.24", "ecfr.gov (web page)"],
  ])("%s", (url, text) => {
    expect(sourceLinkText(url)).toBe(text);
  });

  test("the USITC file endpoint is a download, never shown as a page", () => {
    expect(describeSourceLink("https://hts.usitc.gov/reststop/file?release=2026HTSRev20&filename=Chapter%2099")).toEqual({
      name: "USITC HTS file",
      kind: "download",
    });
  });

  test("an unparseable URL is shown as typed", () => {
    expect(describeSourceLink("not a url")).toEqual({ name: "not a url", kind: "web page" });
  });
});

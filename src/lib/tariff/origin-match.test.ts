import { describe, expect, test } from "vitest";
import { ORIGIN_COUNTRIES } from "./countries";
import { matchOriginCountry, normalizeCountryText } from "./origin-match";

describe("matchOriginCountry", () => {
  test.each([
    ["Vietnam", "VN"],
    ["Viet Nam", "VN"],
    ["  vietnam ", "VN"],
    ["VN", "VN"],
    ["cn", "CN"],
    ["China", "CN"],
    ["PRC", "CN"],
    ["Mainland China", "CN"],
    ["People's Republic of China", "CN"],
    ["UK", "GB"],
    ["United Kingdom", "GB"],
    ["England", "GB"],
    ["South Korea", "KR"],
    ["Korea, Republic of", "KR"],
    ["Türkiye", "TR"],
    ["Turkey", "TR"],
    ["Czech Republic", "CZ"],
    ["Czechia", "CZ"],
    ["Côte d’Ivoire", "CI"],
    ["Ivory Coast", "CI"],
    ["Burma", "MM"],
    ["Myanmar", "MM"],
    ["Hong Kong", "HK"],
    ["Taiwan", "TW"],
    ["The Netherlands", "NL"],
    ["Bosnia & Herzegovina", "BA"],
    ["Trinidad and Tobago", "TT"],
    ["Guinea", "GN"],
    ["Papua New Guinea", "PG"],
    ["Niger", "NE"],
    ["Nigeria", "NG"],
    ["Dominica", "DM"],
    ["Dominican Republic", "DO"],
    ["India", "IN"],
    ["Mexico", "MX"],
    // One country among the parts.
    ["Shenzhen, China", "CN"],
    ["Ho Chi Minh City / Vietnam", "VN"],
    ["Ningbo - China", "CN"],
  ])("%s → %s", (text, code) => {
    expect(matchOriginCountry(text)).toEqual({ kind: "match", code });
  });

  test.each([
    ["Korea", ["KP", "KR"]],
    ["Congo", ["CD", "CG"]],
    ["Virgin Islands", ["VG", "VI"]],
    ["China / Vietnam", ["CN", "VN"]],
    ["Vietnam, Thailand", ["TH", "VN"]],
    ["Busan, Korea", ["KP", "KR"]],
  ])("%s is ambiguous", (text, candidates) => {
    expect(matchOriginCountry(text)).toEqual({ kind: "ambiguous", candidates });
  });

  test.each(["Asia", "EU", "Europe", "Shenzhen", "Made in Vietnam", "USA", "United States", "XX", "Factory 3"])(
    "%s is left for the user to pick",
    (text) => {
      expect(matchOriginCountry(text)).toEqual({ kind: "unknown" });
    },
  );

  test.each([null, undefined, "", "   "])("blank (%s) is empty", (text) => {
    expect(matchOriginCountry(text)).toEqual({ kind: "empty" });
  });

  test("every listed country's own name maps back to it", () => {
    const misses = ORIGIN_COUNTRIES.filter((c) => {
      const m = matchOriginCountry(c.name);
      return !(m.kind === "match" && m.code === c.code);
    });
    expect(misses).toEqual([]);
  });

  test("normalizes accents, ampersands and punctuation", () => {
    expect(normalizeCountryText("  Côte d’Ivoire ")).toBe("cote divoire");
    expect(normalizeCountryText("St. Kitts & Nevis")).toBe("st kitts and nevis");
    expect(normalizeCountryText("The Bahamas")).toBe("bahamas");
  });
});

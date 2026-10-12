import { describe, expect, test } from "vitest";
import type { ForwarderPayload } from "./payload-schema";
import { displayComparability, percent, validityText, vsToday } from "./portal-text";

type Comparison = ForwarderPayload["comparison"];
type Option = Comparison["options"][number];

function option(validUntil: string | null, comparability: Option["comparability"] = "like_for_like"): Option {
  return {
    name: "A",
    role: "backup",
    comparability,
    costUsd: 9000,
    savingPct: 0.1,
    savingUsd: 1000,
    leadMinDays: null,
    leadMaxDays: null,
    fcrPct: null,
    validUntil,
  };
}

function comparison(dates: (string | null)[]): Comparison {
  return { options: dates.map((d) => option(d)) } as Comparison;
}

describe("portal text", () => {
  test("percentages and savings in words", () => {
    expect(percent(0.1)).toBe("10%");
    expect(percent(0.058)).toBe("5.8%");
    expect(percent(-0.0449)).toBe("4.5%");
    expect(vsToday(0.1)).toBe("10% below today");
    expect(vsToday(-0.04)).toBe("4% above today");
    expect(vsToday(0.0001)).toBe("Same as today");
  });

  test("validity: plenty of time, then the 14-day warning, then expired", () => {
    expect(validityText(comparison(["2026-10-31"]), "2026-10-12")).toEqual({ text: "Quotes valid until Oct 31 (19 days left).", tone: "ok" });
    expect(validityText(comparison(["2026-10-31", "2026-10-21"]), "2026-10-12")).toEqual({
      text: "Quotes valid until Oct 21 (9 days left). Prices may change after that.",
      tone: "soon",
    });
    expect(validityText(comparison(["2026-10-12"]), "2026-10-12")?.text).toContain("(today is the last day)");
    expect(validityText(comparison(["2026-10-01"]), "2026-10-12")).toEqual({
      text: "These quotes have expired. We're re-confirming prices.",
      tone: "expired",
    });
    expect(validityText(comparison([null]), "2026-10-12")).toBeNull();
  });

  test("a quote shared as like-for-like shows as expired once its date passes", () => {
    expect(displayComparability(option("2026-10-11"), "2026-10-12")).toBe("expired");
    expect(displayComparability(option("2026-10-12"), "2026-10-12")).toBe("like_for_like");
    expect(displayComparability(option(null), "2026-10-12")).toBe("like_for_like");
    expect(displayComparability(option("2026-10-01", "different_terms"), "2026-10-12")).toBe("different_terms");
  });
});

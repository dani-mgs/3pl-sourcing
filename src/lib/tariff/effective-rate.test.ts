import { describe, expect, test } from "vitest";
import type { DutyReviewNote } from "./additional-duties";
import { effectiveRates, oldestReview } from "./effective-rate";

const amounts = (customsValueUsd: number, baseDutyUsd: number, additionalDutiesUsd: number, feesUsd: number) => ({
  customsValueUsd,
  baseDutyUsd,
  additionalDutiesUsd,
  totalUsd: Math.round((baseDutyUsd + additionalDutiesUsd + feesUsd) * 100) / 100,
});

describe("effectiveRates", () => {
  test("duties and the all-in total as a percentage of the customs value", () => {
    // $50,000: 0 + 12,500 + 6,250 duties, $235.70 fees, $18,985.70 total.
    expect(effectiveRates(amounts(50000, 0, 18750, 235.7))).toEqual({ duties: "37.5%", allIn: "38.0%" });
  });

  test("rounds half up to 0.1%, from exact cents", () => {
    expect(effectiveRates(amounts(10000, 1235, 0, 0))).toEqual({ duties: "12.4%", allIn: "12.4%" }); // 12.35%
    expect(effectiveRates(amounts(10000, 1234, 0, 0))?.duties).toBe("12.3%"); // 12.34%
    expect(effectiveRates(amounts(10000, 1236, 0, 0))?.duties).toBe("12.4%"); // 12.36%
    expect(effectiveRates(amounts(30000, 1, 0, 0))?.duties).toBe("0.0%"); // 0.0033%
    expect(effectiveRates(amounts(3, 0.01, 0, 0))?.duties).toBe("0.3%"); // 0.333%
  });

  test("no duties: 0.0% and the fees alone", () => {
    expect(effectiveRates(amounts(10000, 0, 0, 47.14))).toEqual({ duties: "0.0%", allIn: "0.5%" });
  });

  test("a rate above 100% is shown as it is", () => {
    expect(effectiveRates(amounts(1000, 0, 2500, 34.58))).toEqual({ duties: "250.0%", allIn: "253.5%" });
  });

  test("nothing to divide by", () => {
    expect(effectiveRates(amounts(0, 0, 0, 0))).toBeNull();
  });
});

const lineFor = (code: string) => ({
  kind: "additional" as const, code, label: code, rateText: "+25%", amountUsd: 100, detail: null, sourceLabel: "x", sourceUrl: "https://x/", effectiveFrom: null,
});
const review = (programKey: string, name: string, reviewedAt: string | null, status: DutyReviewNote["status"] = "reviewed"): DutyReviewNote => ({
  programKey, name, status, reviewedAt, reviewedByName: "Dani", staleReason: null,
});

describe("oldestReview", () => {
  const base = { asOfDate: "2026-10-07" };

  test("names the counted program reviewed longest ago, in days to the calculation date", () => {
    const result = oldestReview({
      ...base,
      lines: [lineFor("section_301_china"), lineFor("section_301_forced_labor")],
      dutyReviews: [
        review("section_301_china", "Section 301 (China)", "2026-08-27T09:00:00Z"),
        review("section_301_forced_labor", "Section 301 (forced labour)", "2026-10-02T09:00:00Z"),
      ],
    });
    expect(result).toEqual({ programName: "Section 301 (China)", days: 41, stale: true, text: "Oldest review: Section 301 (China), 41 days ago" });
  });

  test("the staleness threshold is the existing 30 days: 30 is fine, 31 is stale", () => {
    const at = (date: string) =>
      oldestReview({ ...base, lines: [lineFor("a")], dutyReviews: [review("a", "A", `${date}T00:00:00Z`)] })!;
    expect(at("2026-09-07")).toMatchObject({ days: 30, stale: false });
    expect(at("2026-09-06")).toMatchObject({ days: 31, stale: true });
  });

  test("today and yesterday read naturally", () => {
    const at = (date: string) => oldestReview({ ...base, lines: [lineFor("a")], dutyReviews: [review("a", "A", `${date}T00:00:00Z`)] })!.text;
    expect(at("2026-10-07")).toBe("Oldest review: A, today");
    expect(at("2026-10-06")).toBe("Oldest review: A, 1 day ago");
  });

  test("only programs counted in the estimate (reviewed, with a line) are considered", () => {
    const result = oldestReview({
      ...base,
      lines: [lineFor("section_301_china")],
      dutyReviews: [
        review("section_301_china", "Section 301 (China)", "2026-10-01T00:00:00Z"),
        review("section_232_metals", "Section 232", "2026-01-01T00:00:00Z"), // reviewed, but no line
        review("section_301_forced_labor", "Forced labour", null, "pending_review"),
      ],
    });
    expect(result).toMatchObject({ programName: "Section 301 (China)", days: 6, stale: false });
  });

  test("an exempt line (0.00) still counts the program", () => {
    const exempt = { ...lineFor("section_301_forced_labor"), amountUsd: 0, rateText: "Exempt" };
    expect(oldestReview({ ...base, lines: [exempt], dutyReviews: [review("section_301_forced_labor", "FL", "2026-10-01T00:00:00Z")] })).not.toBeNull();
  });

  test("nothing when no additional-duty program is counted", () => {
    expect(oldestReview({ ...base, lines: [], dutyReviews: [review("a", "A", "2026-10-01T00:00:00Z")] })).toBeNull();
  });
});

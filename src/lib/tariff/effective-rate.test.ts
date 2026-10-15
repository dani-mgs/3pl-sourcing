import { describe, expect, test } from "vitest";
import type { DutyReviewNote } from "./additional-duties";
import { effectiveRates, NO_REVIEWED_DUTIES_TEXT, oldestReview, reviewDateUtc } from "./effective-rate";

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

describe("oldestReview: when the estimate's duty rates were last verified", () => {
  const base = { asOfDate: "2026-10-07" };
  const one = (reviewedAt: string, asOfDate = base.asOfDate) =>
    oldestReview({ asOfDate, lines: [lineFor("a")], dutyReviews: [review("a", "A", reviewedAt)] })!;

  test("the oldest review among counted programs, with its date and program", () => {
    const result = oldestReview({
      ...base,
      lines: [lineFor("section_301_china"), lineFor("section_301_forced_labor")],
      dutyReviews: [
        review("section_301_china", "Section 301 (China)", "2026-08-27T09:00:00Z"),
        review("section_301_forced_labor", "Section 301 (forced labour)", "2026-10-02T09:00:00Z"),
      ],
    });
    expect(result).toEqual({
      programName: "Section 301 (China)",
      reviewedOn: "2026-08-27",
      days: 41,
      stale: true,
      text: "Duty rates last verified: Aug 27, 2026 (oldest reviewed program: Section 301 (China))",
    });
  });

  test("the staleness threshold is the existing 30 days: 30 is fine, 31 is stale", () => {
    expect(one("2026-09-07T00:00:00Z")).toMatchObject({ days: 30, stale: false });
    expect(one("2026-09-06T00:00:00Z")).toMatchObject({ days: 31, stale: true });
  });

  test("reviewed on the day it was calculated", () => {
    expect(one("2026-10-07T08:00:00Z")).toMatchObject({
      days: 0,
      text: "Duty rates last verified: Oct 7, 2026 (oldest reviewed program: A)",
    });
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
    expect(result).toMatchObject({ programName: "Section 301 (China)", reviewedOn: "2026-10-01", days: 6, stale: false });
  });

  test("an exempt line (0.00) still counts the program", () => {
    const exempt = { ...lineFor("section_301_forced_labor"), amountUsd: 0, rateText: "Exempt" };
    expect(oldestReview({ ...base, lines: [exempt], dutyReviews: [review("section_301_forced_labor", "FL", "2026-10-01T00:00:00Z")] })).not.toBeNull();
  });

  test("nothing when no reviewed additional-duty program is counted", () => {
    // A review but no line; pending only; an estimate saved before additional duties existed.
    expect(oldestReview({ ...base, lines: [], dutyReviews: [review("a", "A", "2026-10-01T00:00:00Z")] })).toBeNull();
    expect(oldestReview({ ...base, lines: [lineFor("a")], dutyReviews: [review("a", "A", null, "pending_review")] })).toBeNull();
    expect(oldestReview({ ...base, lines: [], dutyReviews: [] })).toBeNull();
    expect(NO_REVIEWED_DUTIES_TEXT).toBe("No reviewed additional duties in this estimate");
  });

  test("a review's date is its UTC calendar date, at either side of midnight and whatever its offset", () => {
    expect(reviewDateUtc("2026-10-02T23:59:59.999+00:00")).toBe("2026-10-02");
    expect(reviewDateUtc("2026-10-03T00:00:00+00:00")).toBe("2026-10-03");
    expect(reviewDateUtc("2026-10-03T07:30:00+08:00")).toBe("2026-10-02");
    expect(one("2026-10-02T23:59:59.999+00:00").text).toBe("Duty rates last verified: Oct 2, 2026 (oldest reviewed program: A)");
    expect(one("2026-10-03T07:30:00+08:00")).toMatchObject({ reviewedOn: "2026-10-02", days: 5 });
  });

  test("the same date and day count in every time zone the app is used in", () => {
    const zones = [
      "UTC",
      "America/Los_Angeles",
      "Asia/Ho_Chi_Minh",
      "Pacific/Kiritimati",
      "Pacific/Pago_Pago",
      "Australia/Lord_Howe",
      "Asia/Manila",
    ];
    const cases = ["2026-10-02T23:59:59.999+00:00", "2026-10-03T00:00:00+00:00", "2026-10-03T07:30:00+08:00"];
    const original = process.env.TZ;
    const offsets = new Set<number>();
    try {
      const seen = zones.map((zone) => {
        process.env.TZ = zone;
        offsets.add(new Date(2026, 9, 3, 12).getTimezoneOffset());
        return cases.map((at) => {
          const r = one(at);
          return `${r.reviewedOn} ${r.days} ${r.text}`;
        });
      });
      // The zones really were switched (UTC-11 to UTC+14), and nothing moved.
      expect(offsets.size).toBeGreaterThan(5);
      for (const result of seen) expect(result).toEqual(seen[0]);
      expect(seen[0]).toEqual([
        "2026-10-02 5 Duty rates last verified: Oct 2, 2026 (oldest reviewed program: A)",
        "2026-10-03 4 Duty rates last verified: Oct 3, 2026 (oldest reviewed program: A)",
        "2026-10-02 5 Duty rates last verified: Oct 2, 2026 (oldest reviewed program: A)",
      ]);
    } finally {
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    }
  });
});

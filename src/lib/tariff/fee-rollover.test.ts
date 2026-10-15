import { describe, expect, test } from "vitest";
import {
  estimateFeeNote,
  feeRolloverReminder,
  feeYearGap,
  fiscalYearStart,
  missingFeesFor,
  overviewNote,
  reminderLines,
  shortFeeLabel,
  type FeeDateRow,
} from "./fee-rollover";

// The 1 October customs fee rollover, with injected dates. The seeded rows:
// FY2027 MPF (formal and informal) from 2026-10-01 with no end date, HMF
// since 1991.

const SEEDED: FeeDateRow[] = [
  { fee_code: "mpf_formal", effective_from: "2026-10-01", effective_to: null },
  { fee_code: "mpf_informal", effective_from: "2026-10-01", effective_to: null },
  { fee_code: "hmf", effective_from: "1991-01-01", effective_to: null },
];
// FY2028 entered the way the help says: old rows end-dated the day before.
const FY2028_ENTERED: FeeDateRow[] = [
  { fee_code: "mpf_formal", effective_from: "2026-10-01", effective_to: "2027-09-30" },
  { fee_code: "mpf_informal", effective_from: "2026-10-01", effective_to: "2027-09-30" },
  { fee_code: "mpf_formal", effective_from: "2027-10-01", effective_to: null },
  { fee_code: "mpf_informal", effective_from: "2027-10-01", effective_to: null },
  { fee_code: "hmf", effective_from: "1991-01-01", effective_to: null },
];
const BOTH = ["MPF (formal entry)", "MPF (informal entry)"];

describe("fiscal year", () => {
  test("starts on 1 October; FY2028 runs from 2027-10-01 to 2028-09-30", () => {
    expect(fiscalYearStart("2027-09-30")).toBe("2026-10-01");
    expect(fiscalYearStart("2027-10-01")).toBe("2027-10-01");
    expect(fiscalYearStart("2028-09-30")).toBe("2027-10-01");
    expect(fiscalYearStart("2028-02-29")).toBe("2027-10-01");
  });
});

describe("what's missing for a fiscal year", () => {
  test("seeded rows: nothing missing for FY2027 (no row the day before), both MPF fees for FY2028", () => {
    expect(missingFeesFor(SEEDED, "2026-10-01")).toEqual([]);
    expect(missingFeesFor(SEEDED, "2027-10-01")).toEqual(BOTH);
  });

  test("HMF is never checked: it's fixed, not re-set each year", () => {
    expect(missingFeesFor([{ fee_code: "hmf", effective_from: "1991-01-01", effective_to: null }], "2027-10-01")).toEqual([]);
  });

  test("only the informal fee not entered", () => {
    expect(missingFeesFor([...SEEDED, { fee_code: "mpf_formal", effective_from: "2027-10-01", effective_to: null }], "2027-10-01")).toEqual([
      "MPF (informal entry)",
    ]);
  });

  test("a new row starting after 1 October counts as entered", () => {
    const later = SEEDED.map((r) => (r.fee_code === "hmf" ? r : { ...r, effective_to: "2027-10-04" }));
    expect(
      missingFeesFor(
        [...later, { fee_code: "mpf_formal", effective_from: "2027-10-05", effective_to: null }, { fee_code: "mpf_informal", effective_from: "2027-10-05", effective_to: null }],
        "2027-10-01",
      ),
    ).toEqual([]);
  });

  test("old rows end-dated with nothing added: still missing", () => {
    expect(missingFeesFor(SEEDED.map((r) => ({ ...r, effective_to: "2027-09-30" })), "2027-10-01")).toEqual(BOTH);
  });
});

describe("the reminder", () => {
  test("none until 45 days before 1 October; due soon from Aug 17 to Sep 30; overdue from Oct 1", () => {
    expect(feeRolloverReminder(SEEDED, "2026-10-16")).toBeNull();
    expect(feeRolloverReminder(SEEDED, "2027-08-16")).toBeNull();
    expect(feeRolloverReminder(SEEDED, "2027-08-17")).toEqual({ state: "due_soon", fiscalYear: 2028, startsOn: "2027-10-01", missing: BOTH });
    expect(feeRolloverReminder(SEEDED, "2027-09-30")).toMatchObject({ state: "due_soon", fiscalYear: 2028 });
    expect(feeRolloverReminder(SEEDED, "2027-10-01")).toMatchObject({ state: "overdue", fiscalYear: 2028, startsOn: "2027-10-01" });
    expect(feeRolloverReminder(SEEDED, "2027-10-02")).toMatchObject({ state: "overdue", fiscalYear: 2028 });
    // Still overdue long after, until the rows are entered.
    expect(feeRolloverReminder(SEEDED, "2028-06-01")).toMatchObject({ state: "overdue", fiscalYear: 2028 });
  });

  test("entering FY2028 early clears it, before and after 1 October", () => {
    for (const today of ["2027-08-17", "2027-09-30", "2027-10-01", "2027-10-02"]) {
      expect(feeRolloverReminder(FY2028_ENTERED, today)).toBeNull();
    }
  });

  test("the first year after seeding raises nothing", () => {
    expect(feeRolloverReminder(SEEDED, "2026-10-01")).toBeNull();
  });
});

describe("estimates", () => {
  test("an entry date in a fiscal year whose fees aren't entered: Sep 30 no, Oct 1 and 2 yes", () => {
    expect(feeYearGap(SEEDED, "2027-09-30")).toBeNull();
    expect(feeYearGap(SEEDED, "2027-10-01")).toEqual({ fiscalYear: 2028, startsOn: "2027-10-01", missing: BOTH });
    expect(feeYearGap(SEEDED, "2027-10-02")).toMatchObject({ fiscalYear: 2028 });
    expect(feeYearGap(FY2028_ENTERED, "2027-10-02")).toBeNull();
  });
});

describe("wording", () => {
  const due = feeRolloverReminder(SEEDED, "2027-09-30")!;
  const overdue = feeRolloverReminder(SEEDED, "2027-10-01")!;

  test("due soon: a tariff editor is told to add them; anyone else to ask a tariff editor", () => {
    expect(reminderLines(due, true)).toEqual([
      "MPF rates for FY2028 start on 1 October. Check the new rates and add them here; end-date the old rows the day before.",
      "Not entered yet: MPF (formal entry), MPF (informal entry).",
    ]);
    expect(reminderLines(due, false)).toEqual([
      "MPF rates for FY2028 start on 1 October. Ask a tariff editor to add them.",
      "Not entered yet: MPF (formal entry), MPF (informal entry).",
    ]);
  });

  test("overdue says what it means for estimates first", () => {
    expect(reminderLines(overdue, true)[0]).toBe(
      "FY2028 started on Oct 1, 2027 and its MPF rates aren't entered: estimates for entry from that day use FY2027's.",
    );
    expect(reminderLines(overdue, false)[1]).toBe("MPF rates for FY2028 start on 1 October. Ask a tariff editor to add them.");
  });

  test("overview note, estimate line and short label; HMF never mentioned", () => {
    expect(overviewNote(due)).toBe("Customs fees: MPF rates for FY2028 start on 1 October and aren't entered yet.");
    expect(overviewNote(overdue)).toBe("Customs fees: MPF rates for FY2028 started on Oct 1, 2027 and aren't entered yet.");
    expect(estimateFeeNote(feeYearGap(SEEDED, "2027-10-02")!)).toBe(
      "Not final: MPF fees for FY2028 (from Oct 1, 2027) aren't entered yet; FY2027's are used.",
    );
    expect(shortFeeLabel(2028)).toBe("FY2028 MPF fees not entered");
    const all = [...reminderLines(due, true), ...reminderLines(overdue, false), overviewNote(due), overviewNote(overdue)].join(" ");
    expect(all).not.toContain("HMF");
  });
});

describe("the same in every time zone", () => {
  test("Sep 30, Oct 1 and Oct 2 and the 45-day edge give the same answers in all 7 regression time zones", () => {
    const zones = ["UTC", "America/Los_Angeles", "Asia/Ho_Chi_Minh", "Pacific/Kiritimati", "Pacific/Pago_Pago", "Australia/Lord_Howe", "Asia/Manila"];
    const days = ["2027-08-16", "2027-08-17", "2027-09-30", "2027-10-01", "2027-10-02"];
    const original = process.env.TZ;
    const offsets = new Set<number>();
    try {
      const seen = zones.map((zone) => {
        process.env.TZ = zone;
        offsets.add(new Date(2027, 9, 1, 12).getTimezoneOffset());
        return days.map((d) => {
          const r = feeRolloverReminder(SEEDED, d);
          return `${d} ${r?.state ?? "none"} ${r ? reminderLines(r, true)[0] : ""} | ${feeYearGap(SEEDED, d)?.fiscalYear ?? "-"}`;
        });
      });
      expect(offsets.size).toBeGreaterThan(5);
      for (const s of seen) expect(s).toEqual(seen[0]);
      expect(seen[0].map((s) => s.split(" ").slice(0, 2).join(" "))).toEqual([
        "2027-08-16 none",
        "2027-08-17 due_soon",
        "2027-09-30 due_soon",
        "2027-10-01 overdue",
        "2027-10-02 overdue",
      ]);
    } finally {
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    }
  });
});

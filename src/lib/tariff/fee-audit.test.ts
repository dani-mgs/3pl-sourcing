import { describe, expect, test } from "vitest";
import { feeAudit, personName, summarizeFeeChange, type DisplayNames, type FeeHistoryRow } from "./fee-audit";

// Who created and last changed a customs fee row, and its history, as shown
// on Duty data → Fees.

const DANI = "00000000-0000-4000-8000-0000000000d1";
const NO_NAME = "00000000-0000-4000-8000-0000000000e2";
const GONE = "00000000-0000-4000-8000-0000000000f3";
const names: DisplayNames = new Map<string, string | null>([
  [DANI, "Dani"],
  [NO_NAME, null],
]);

const SEEDED_AT = "2026-10-02T13:51:39.123456+00:00";
const seeded = { created_at: SEEDED_AT, created_by: null, updated_at: SEEDED_AT, updated_by: null };

const MPF = {
  id: "row-1", fee_code: "mpf_formal", label: "Merchandise Processing Fee (formal entry)", rate_pct: 0.3464,
  min_usd: 34.58, max_usd: 670.86, flat_usd: null, applies_up_to_value_usd: null, effective_from: "2026-10-01",
  effective_to: null, source_label: "FR 2026-15530", source_url: "https://www.federalregister.gov/", notes: null,
  created_at: SEEDED_AT, created_by: null, updated_at: SEEDED_AT, updated_by: null,
};

let seq = 0;
const entry = (over: Partial<FeeHistoryRow>): FeeHistoryRow => ({
  id: ++seq, row_id: "row-1", operation: "UPDATE", old_row: MPF, new_row: MPF, changed_by: DANI,
  changed_at: "2026-10-15T09:00:00+00:00", ...over,
});
const endDated = entry({
  old_row: MPF,
  new_row: { ...MPF, effective_to: "2027-09-30", updated_at: "2026-10-15T09:00:00+00:00", updated_by: DANI },
});

describe("created and last changed", () => {
  test("a seeded row nobody has changed", () => {
    expect(feeAudit(seeded, [], names)).toEqual({
      created: "Seeded Oct 2, 2026",
      lastChanged: "Not changed since",
      history: [],
      emptyHistoryText: "No changes recorded since it was seeded.",
    });
  });

  test("a seeded row end-dated by an editor: end-dating is a change", () => {
    const a = feeAudit({ ...seeded, updated_at: "2026-10-15T09:00:00+00:00", updated_by: DANI }, [endDated], names);
    expect(a.created).toBe("Seeded Oct 2, 2026");
    expect(a.lastChanged).toBe("Last changed Oct 15, 2026 by Dani");
    expect(a.history.map((h) => h.text)).toEqual(["Oct 15, 2026 · Dani: End date set to Sep 30, 2027"]);
  });

  test("a row an editor added and nobody changed", () => {
    const at = "2026-10-10T08:00:00+00:00";
    const a = feeAudit({ created_at: at, created_by: DANI, updated_at: at, updated_by: DANI }, [entry({ operation: "INSERT", old_row: null, changed_at: at })], names);
    expect(a).toMatchObject({ created: "Created Oct 10, 2026 by Dani", lastChanged: "Not changed since", emptyHistoryText: "No changes recorded." });
    expect(a.history.map((h) => h.text)).toEqual(["Oct 10, 2026 · Dani: Added"]);
  });

  test("a user with no display name is 'Staff'; one without a profile is 'Unknown user'; never an id", () => {
    expect(personName(NO_NAME, names)).toBe("Staff");
    expect(personName(DANI, new Map([[DANI, "  "]]))).toBe("Staff");
    expect(personName(GONE, names)).toBe("Unknown user");
    const a = feeAudit(
      { created_at: SEEDED_AT, created_by: NO_NAME, updated_at: "2026-10-15T09:00:00+00:00", updated_by: GONE },
      [entry({ changed_by: GONE, new_row: { ...MPF, notes: "x" } })],
      names,
    );
    expect(a.created).toBe("Created Oct 2, 2026 by Staff");
    expect(a.lastChanged).toBe("Last changed Oct 15, 2026 by Unknown user");
    expect(JSON.stringify(a)).not.toMatch(/0000-4000|@/);
  });

  test("a change with no user (a migration)", () => {
    const a = feeAudit({ ...seeded, updated_at: "2026-10-15T09:00:00+00:00" }, [entry({ changed_by: null, new_row: { ...MPF, notes: "x" } })], names);
    expect(a.lastChanged).toBe("Last changed Oct 15, 2026 by a migration");
    expect(a.history[0].text).toBe("Oct 15, 2026 · Migration: Notes none → x");
  });

  test("history is newest first", () => {
    const a = feeAudit(seeded, [entry({ changed_at: "2026-10-10T00:00:00Z", new_row: { ...MPF, notes: "a" } }), endDated], names);
    expect(a.history.map((h) => h.text)).toEqual([
      "Oct 15, 2026 · Dani: End date set to Sep 30, 2027",
      "Oct 10, 2026 · Dani: Notes none → a",
    ]);
  });
});

describe("what changed", () => {
  test("added, deleted, end date set, changed and removed", () => {
    expect(summarizeFeeChange({ operation: "INSERT", old_row: null, new_row: MPF })).toBe("Added");
    expect(summarizeFeeChange({ operation: "DELETE", old_row: MPF, new_row: null })).toBe("Deleted");
    expect(summarizeFeeChange(endDated)).toBe("End date set to Sep 30, 2027");
    const ended = { ...MPF, effective_to: "2027-09-30" };
    expect(summarizeFeeChange({ operation: "UPDATE", old_row: ended, new_row: { ...MPF, effective_to: "2027-06-30" } })).toBe(
      "End date Sep 30, 2027 → Jun 30, 2027",
    );
    expect(summarizeFeeChange({ operation: "UPDATE", old_row: ended, new_row: MPF })).toBe("End date removed");
  });

  test("several fields, with the form's labels, never column names", () => {
    expect(
      summarizeFeeChange({
        operation: "UPDATE",
        old_row: MPF,
        new_row: { ...MPF, max_usd: 690, fee_code: "hmf", effective_from: "2026-10-02" },
      }),
    ).toBe("Fee MPF (formal entry) → HMF; Maximum (USD) 670.86 → 690; First day it applies Oct 1, 2026 → Oct 2, 2026");
  });

  test("the audit stamps alone aren't a change of the fee", () => {
    expect(
      summarizeFeeChange({ operation: "UPDATE", old_row: MPF, new_row: { ...MPF, updated_at: "2026-10-15T09:00:00Z", updated_by: DANI } }),
    ).toBe("No change to the fee");
  });
});

describe("dates are UTC calendar dates in every time zone", () => {
  test("a change late on Oct 15 (UTC) reads Oct 15 in all 7 regression time zones", () => {
    const zones = ["UTC", "America/Los_Angeles", "Asia/Ho_Chi_Minh", "Pacific/Kiritimati", "Pacific/Pago_Pago", "Australia/Lord_Howe", "Asia/Manila"];
    const late = "2026-10-15T23:30:00+00:00";
    const original = process.env.TZ;
    const offsets = new Set<number>();
    try {
      const seen = zones.map((zone) => {
        process.env.TZ = zone;
        offsets.add(new Date(2026, 9, 15, 12).getTimezoneOffset());
        const a = feeAudit({ ...seeded, updated_at: late, updated_by: DANI }, [entry({ changed_at: late })], names);
        return [a.created, a.lastChanged, a.history[0].text];
      });
      expect(offsets.size).toBeGreaterThan(5);
      for (const s of seen) expect(s).toEqual(seen[0]);
      expect(seen[0]).toEqual([
        "Seeded Oct 2, 2026",
        "Last changed Oct 15, 2026 by Dani",
        "Oct 15, 2026 · Dani: No change to the fee",
      ]);
    } finally {
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    }
  });
});

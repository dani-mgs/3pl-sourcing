import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { feeRolloverReminder, type FeeDateRow } from "@/lib/tariff/fee-rollover";
import { FeeRolloverOverviewNote, FeeRolloverReminderBox } from "./fee-rollover-notice";

// The fee rollover reminder on Duty data → Fees and the overview note.

const SEEDED: FeeDateRow[] = [
  { fee_code: "mpf_formal", effective_from: "2026-10-01", effective_to: null },
  { fee_code: "mpf_informal", effective_from: "2026-10-01", effective_to: null },
  { fee_code: "hmf", effective_from: "1991-01-01", effective_to: null },
];
const due = feeRolloverReminder(SEEDED, "2027-09-30")!;
const overdue = feeRolloverReminder(SEEDED, "2027-10-01")!;

// The visible text, one entry per paragraph.
const text = (html: string) =>
  [...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)].map((m) =>
    m[1].replace(/<svg[\s\S]*?<\/svg>/g, "").replace(/<[^>]+>/g, "").replace(/&#x27;/g, "'").trim(),
  );

describe("Fees page reminder", () => {
  test("due soon, tariff editor", () => {
    expect(text(renderToStaticMarkup(<FeeRolloverReminderBox reminder={due} canEditFees />))).toEqual([
      "MPF rates for FY2028 start on 1 October. Check the new rates and add them here; end-date the old rows the day before.",
      "Not entered yet: MPF (formal entry), MPF (informal entry).",
    ]);
  });

  test("due soon, staff who can't edit fees", () => {
    const lines = text(renderToStaticMarkup(<FeeRolloverReminderBox reminder={due} canEditFees={false} />));
    expect(lines).toEqual([
      "MPF rates for FY2028 start on 1 October. Ask a tariff editor to add them.",
      "Not entered yet: MPF (formal entry), MPF (informal entry).",
    ]);
    expect(lines.join(" ")).not.toContain("add them here");
  });

  test("overdue, tariff editor", () => {
    expect(text(renderToStaticMarkup(<FeeRolloverReminderBox reminder={overdue} canEditFees />))).toEqual([
      "FY2028 started on Oct 1, 2027 and its MPF rates aren't entered: estimates for entry from that day use FY2027's.",
      "MPF rates for FY2028 start on 1 October. Check the new rates and add them here; end-date the old rows the day before.",
      "Not entered yet: MPF (formal entry), MPF (informal entry).",
    ]);
  });

  test("overdue, staff who can't edit fees", () => {
    expect(text(renderToStaticMarkup(<FeeRolloverReminderBox reminder={overdue} canEditFees={false} />))[1]).toBe(
      "MPF rates for FY2028 start on 1 October. Ask a tariff editor to add them.",
    );
  });

  test("it's a note, with the icon hidden from screen readers and HMF never mentioned", () => {
    const html = renderToStaticMarkup(<FeeRolloverReminderBox reminder={overdue} canEditFees />);
    expect(html).toContain('role="note"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain("HMF");
  });
});

describe("Duty data overview note", () => {
  test("due soon and overdue, linking to the Fees page", () => {
    const dueHtml = renderToStaticMarkup(<FeeRolloverOverviewNote reminder={due} />);
    expect(text(dueHtml)).toEqual(["Customs fees: MPF rates for FY2028 start on 1 October and aren't entered yet. Customs fees →"]);
    expect(dueHtml).toContain('href="/tariff-calculator/duty-data/fees"');
    expect(text(renderToStaticMarkup(<FeeRolloverOverviewNote reminder={overdue} />))).toEqual([
      "Customs fees: MPF rates for FY2028 started on Oct 1, 2027 and aren't entered yet. Customs fees →",
    ]);
  });
});

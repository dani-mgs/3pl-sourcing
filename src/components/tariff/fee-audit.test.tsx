import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { feeAudit, type DisplayNames, type FeeHistoryRow } from "@/lib/tariff/fee-audit";
import { FeeAuditCell } from "./fee-audit";

// The "Changes" cell on Duty data → Fees.

const DANI = "00000000-0000-4000-8000-0000000000d1";
const NO_NAME = "00000000-0000-4000-8000-0000000000e2";
const names: DisplayNames = new Map<string, string | null>([
  [DANI, "Dani"],
  [NO_NAME, null],
]);
const SEEDED_AT = "2026-10-02T13:51:39+00:00";
const CHANGED_AT = "2026-10-15T09:00:00+00:00";
const seeded = { created_at: SEEDED_AT, created_by: null, updated_at: SEEDED_AT, updated_by: null };
const endDate = (changedBy: string): FeeHistoryRow => ({
  id: 1, row_id: "row-1", operation: "UPDATE", changed_by: changedBy, changed_at: CHANGED_AT,
  old_row: { effective_to: null }, new_row: { effective_to: "2027-09-30", updated_by: changedBy, updated_at: CHANGED_AT },
});

const render = (audit: ReturnType<typeof feeAudit>) => renderToStaticMarkup(<FeeAuditCell audit={audit} />);

describe("Changes cell", () => {
  test("a seeded row nobody has changed", () => {
    expect(render(feeAudit(seeded, [], names))).toMatchInlineSnapshot(`"<div class="flex flex-col gap-0.5 text-xs" data-testid="fee-audit"><p class="text-move-navy">Seeded Oct 2, 2026</p><p class="text-neutral-muted">Not changed since</p><details class="mt-1"><summary class="cursor-pointer font-medium text-move-green">History (0)</summary><p class="mt-1 text-neutral-muted">No changes recorded since it was seeded.</p></details></div>"`);
  });

  test("a seeded row end-dated by an editor", () => {
    expect(render(feeAudit({ ...seeded, updated_at: CHANGED_AT, updated_by: DANI }, [endDate(DANI)], names))).toMatchInlineSnapshot(`"<div class="flex flex-col gap-0.5 text-xs" data-testid="fee-audit"><p class="text-move-navy">Seeded Oct 2, 2026</p><p class="text-neutral-muted">Last changed Oct 15, 2026 by Dani</p><details class="mt-1"><summary class="cursor-pointer font-medium text-move-green">History (1)</summary><ul class="mt-1 flex max-h-48 w-64 flex-col gap-1 overflow-y-auto"><li class="break-words text-neutral-muted">Oct 15, 2026 · Dani: End date set to Sep 30, 2027</li></ul></details></div>"`);
  });

  test("a user with no display name shows as Staff, with no email or id", () => {
    const html = render(feeAudit({ ...seeded, updated_at: CHANGED_AT, updated_by: NO_NAME }, [endDate(NO_NAME)], names));
    expect(html).toMatchInlineSnapshot(`"<div class="flex flex-col gap-0.5 text-xs" data-testid="fee-audit"><p class="text-move-navy">Seeded Oct 2, 2026</p><p class="text-neutral-muted">Last changed Oct 15, 2026 by Staff</p><details class="mt-1"><summary class="cursor-pointer font-medium text-move-green">History (1)</summary><ul class="mt-1 flex max-h-48 w-64 flex-col gap-1 overflow-y-auto"><li class="break-words text-neutral-muted">Oct 15, 2026 · Staff: End date set to Sep 30, 2027</li></ul></details></div>"`);
    expect(html).not.toMatch(/0000-4000|@/);
  });

  test("history is collapsed, with its count", () => {
    const html = render(feeAudit(seeded, [], names));
    expect(html).toMatch(/<details[^>]*><summary[^>]*>History \(0\)<\/summary>/);
    expect(html).not.toMatch(/<details[^>]* open/);
  });
});

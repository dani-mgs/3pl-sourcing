import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import { inputsFromCells } from "@/lib/forwarder-audit/cell-map";

// The editor's first render for a real case (what a visitor sees before
// touching anything): every section, the saved charge lines with the
// workbook's calculated columns, and section 5 from the same engine. Static
// markup: input values aren't in it, so this checks structure and results.

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/" }));
vi.mock("../actions", () => ({ saveAuditAction: vi.fn(), deleteAuditAction: vi.fn() }));
const { AuditEditor } = await import("./audit-editor");

const load = (name: string) =>
  inputsFromCells(JSON.parse(readFileSync(path.join(process.cwd(), "src/lib/forwarder-audit/__fixtures__/golden", `${name}.json`), "utf8")).inputs);
const render = (name: string, canEdit = true) =>
  renderToStaticMarkup(<AuditEditor auditId="a1" initial={load(name)} updatedAt="2026-10-26T14:06:23.123456+00:00" canEdit={canEdit} ownerName="Dani" />);

describe("AuditEditor", () => {
  test("Synthetic Errors: all five sections and the workbook's results", () => {
    const html = render("Test_Synthetic_Errors");
    for (const title of ["1 Shipment information", "2 Quotation information", "3 Requested services", "4 Charge breakdown", "5 Audit results"]) {
      expect(html).toContain(title);
    }
    expect(html).toContain("Corrections Required");
    expect(html).toContain("4 errors · 8 questions · 1 risks");
    expect(html).toContain("Error - differs by 2.60 USD");
    expect(html).toContain("All-In Firm Total (as quoted) — Subject to Correction");
    expect(html).toContain("1,039.40");
    expect(html).toContain("Possible duplicate (same name, same service)");
    expect(html).toContain("6 of 50 lines");
  });

  test("Airspeed: the open questions and the not-all-in note", () => {
    const html = render("Test_Airspeed_FCL");
    expect(html).toContain("Needs Clarification");
    expect(html).toContain("0 errors · 10 questions · 2 risks");
    expect(html).toContain("Not all-in: 2 requested service(s) excluded, unpriced or not addressed; conditional charges; ");
    expect(html).toContain("Load plan not confirmed");
  });

  test("a viewer who isn't the owner sees it read-only", () => {
    const html = render("Test_Navilink_LCL", false);
    expect(html).toContain("<fieldset");
    expect(html).toMatch(/<fieldset[^>]*disabled/);
    expect(html).not.toContain("Save audit");
    expect(html).not.toContain("Delete audit");
    expect(html).toContain("only its owner or an admin can change it");
  });

  test("the owner gets Save and Delete, and Save starts disabled (nothing changed)", () => {
    const html = render("Test_Navilink_LCL");
    expect(html).toContain("Delete audit");
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Saved<\/button>/);
  });
});

import { describe, expect, test } from "vitest";
import { NOT_FOUND, OUTDATED, OWNER_ONLY, STALE, draftError } from "./draft-errors";

// Database errors become our own words; a database message is never shown.

describe("draftError", () => {
  test("stale, not the owner, not found", () => {
    expect(draftError({ code: "LC409", message: "This workspace was changed since you opened it." })).toEqual({ code: "stale", message: STALE });
    expect(draftError({ code: "42501", message: "new row violates row-level security policy" })).toEqual({ code: "forbidden", message: OWNER_ONLY });
    expect(draftError({ code: "P0002" })).toEqual({ code: "not_found", message: NOT_FOUND });
  });

  test("a page from before the last change (LC426): the reload message", () => {
    expect(draftError({ code: "LC426", message: "This page is out of date." })).toEqual({ code: "stale", message: OUTDATED });
    expect(OUTDATED).toBe("This page is out of date. Reload to continue.");
  });

  test.each([
    ["A workspace can have at most 100 SKU lines.", "A workspace can have at most 100 SKU lines."],
    ["A workspace can have at most 5 scenarios.", "A workspace can have at most 5 scenarios."],
    ["A scenario can have at most 20 other costs.", "A scenario can have at most 20 other costs."],
    ["Quantity x FOB price must come to more than $0.00 and less than $100 trillion.", "Quantity × FOB price must come to more than $0.00 and less than $100 trillion."],
    ['duplicate key value violates unique constraint "landed_cost_sku_lines_sku_code_unique"', "Each SKU code can be used only once in a workspace."],
    ['duplicate key value violates unique constraint "landed_cost_scenarios_label_unique"', "Each scenario needs its own label."],
  ])("a limit or check: %s", (message, expected) => {
    const code = message.startsWith("duplicate") ? "23505" : "23514";
    expect(draftError({ code, message })).toEqual({ code: "invalid", message: expected });
  });

  test("anything else is a plain message, with no SQL in it", () => {
    const unknownCheck = draftError({ code: "23514", message: 'new row for relation "landed_cost_scenario_items" violates check constraint "x"' });
    expect(unknownCheck.message).not.toMatch(/relation|constraint|landed_cost/);
    for (const code of ["LC422", "22P02", "23502", "23503"]) {
      const mapped = draftError({ code, message: 'invalid input syntax for type uuid: "x"' });
      expect(mapped.code).toBe("invalid");
      expect(mapped.message).not.toMatch(/syntax|uuid/);
    }
    expect(draftError({ code: "XX000", message: "connection reset" })).toEqual({
      code: "failed",
      message: "The workspace couldn't be saved right now. Try again.",
    });
    expect(draftError({}).code).toBe("failed");
  });
});

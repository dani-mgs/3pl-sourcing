import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { SHIPMENT_MODES } from "@/lib/tariff/calculate";
import { ORIGIN_COUNTRY_CODES } from "@/lib/tariff/countries";
import { UNIT_TOKENS } from "@/lib/tariff/rate-text";
import { FREIGHT_BASES, SUPPORTED_INCOTERMS } from "./scenario-totals";

// The workspace tables' value lists must be exactly the ones the app accepts,
// so the database never stores an input the calculation would refuse (or
// refuses one it accepts). Reads the migration as shipped.

const MIGRATION = readFileSync(
  path.join(process.cwd(), "supabase/migrations/20261021013030_landed_cost_workspaces.sql"),
  "utf8",
);

// The quoted values of `<column> in (...)` in the constraint for that column.
function listFor(column: string): string[] {
  const match = new RegExp(`check \\(${column} in \\(([^)]*)\\)\\)`).exec(MIGRATION);
  if (!match) throw new Error(`no list for ${column}`);
  return [...match[1].matchAll(/'((?:[^']|'')*)'/g)].map((m) => m[1].replace(/''/g, "'"));
}

describe("workspace tables match the app's lists", () => {
  test("origin countries", () => {
    expect(listFor("origin_country")).toEqual([...ORIGIN_COUNTRY_CODES]);
  });

  test("duty quantity units", () => {
    // Sorted: Object.keys lists integer-like keys ("1000") first.
    expect(listFor("duty_quantity_unit").sort()).toEqual([...UNIT_TOKENS].sort());
  });

  test("incoterms, shipment modes, freight bases, entry types", () => {
    expect(listFor("incoterm")).toEqual([...SUPPORTED_INCOTERMS]);
    expect(listFor("shipment_mode").sort()).toEqual([...SHIPMENT_MODES].sort());
    expect(listFor("freight_basis")).toEqual([...FREIGHT_BASES]);
    expect(listFor("entry_type")).toEqual(["auto", "formal"]);
  });

  test("landed_cost_text_ok trims exactly what JavaScript's trim() does", () => {
    const literal = /btrim\(p_text, E'([^']*)'\)/.exec(MIGRATION);
    if (!literal) throw new Error("no btrim set");
    const sqlSet = new Set(
      literal[1]
        .replace(/\\u([0-9a-f]{4})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
        .replace(/\\t/g, "\t")
        .replace(/\\n/g, "\n")
        .replace(/\\f/g, "\f")
        .replace(/\\r/g, "\r"),
    );
    const jsSet = new Set<string>();
    for (let code = 0; code <= 0xffff; code++) {
      const ch = String.fromCharCode(code);
      if (ch.trim() === "") jsSet.add(ch);
    }
    expect([...sqlSet].sort()).toEqual([...jsSet].sort());
  });
});

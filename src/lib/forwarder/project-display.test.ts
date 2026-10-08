import { describe, expect, test } from "vitest";
import { formatProjectValue, routeLabel, shortRouteLabel } from "./project-display";
import type { ProjectField } from "./project-sections";

const field = (f: Record<string, unknown>) => f as unknown as ProjectField;

describe("formatProjectValue (feeds the Project Summary and exports)", () => {
  test("empty values are a dash", () => {
    expect(formatProjectValue(field({ kind: "text", name: "hs_code" }), { hs_code: null })).toBe("—");
    expect(formatProjectValue(field({ kind: "text", name: "hs_code" }), { hs_code: "" })).toBe("—");
    expect(formatProjectValue(field({ kind: "multi", name: "x" }), { x: [] })).toBe("—");
  });

  test("text keeps leading zeros; numbers get separators", () => {
    expect(formatProjectValue(field({ kind: "text", name: "hs_code" }), { hs_code: "0401" })).toBe("0401");
    expect(formatProjectValue(field({ kind: "decimal", name: "cbm" }), { cbm: "1234.5" })).toBe("1,234.5");
  });

  test("money in USD, in the row's own currency, or plain when that currency is unset", () => {
    expect(
      formatProjectValue(field({ kind: "money", name: "c", currency: "USD" }), { c: "3000" }),
    ).toBe("$3,000.00");
    const invoice = field({ kind: "money", name: "v", currency: { field: "cur" } });
    expect(formatProjectValue(invoice, { v: 5000, cur: "EUR" })).toBe("€5,000.00");
    expect(formatProjectValue(invoice, { v: 5000, cur: null })).toBe("5,000.00");
  });

  test("lists are joined", () => {
    expect(formatProjectValue(field({ kind: "multi", name: "x" }), { x: ["FOB", "CIF"] })).toBe("FOB, CIF");
  });
});

describe("formatProjectValue: project duration", () => {
  const duration = field({ kind: "integer", name: "project_duration_months", unit: "month" });
  const row = (v: unknown) => ({ project_duration_months: v });

  test("months are pluralised, and empty is a dash", () => {
    expect(formatProjectValue(duration, row(12))).toBe("12 months");
    expect(formatProjectValue(duration, row(1))).toBe("1 month");
    expect(formatProjectValue(duration, row(120))).toBe("120 months");
    expect(formatProjectValue(duration, row(null))).toBe("—");
    expect(formatProjectValue(duration, {})).toBe("—");
  });

  test("an integer field without a unit is unchanged", () => {
    expect(formatProjectValue(field({ kind: "integer", name: "units" }), { units: 1200 })).toBe("1,200");
  });
});

describe("route labels", () => {
  test("long and short forms, with a dash for a missing end", () => {
    const row = { origin_city: "Shenzhen", origin_country: "China", destination_country: "United States" };
    expect(routeLabel(row)).toBe("Shenzhen, China → United States");
    expect(shortRouteLabel(row)).toBe("Shenzhen → United States");
    expect(routeLabel({ origin_city: "Shenzhen" })).toBe("Shenzhen → —");
    expect(routeLabel({})).toBeNull();
  });
});

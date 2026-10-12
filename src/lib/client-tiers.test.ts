import { describe, expect, test } from "vitest";
import { effectiveTier, tiersByClientId } from "./client-tiers";

const NOW = Date.parse("2026-10-12T12:00:00Z");

describe("effectiveTier", () => {
  test.each([
    ["no row", null, "free"],
    ["a free row", { tier: "free", valid_until: null }, "free"],
    ["the paid tier with no end date", { tier: "market_report", valid_until: null }, "market_report"],
    ["the paid tier ending later", { tier: "market_report", valid_until: "2026-10-13T00:00:00Z" }, "market_report"],
    ["the paid tier that ended", { tier: "market_report", valid_until: "2026-10-12T11:59:59Z" }, "free"],
    ["the paid tier ending right now", { tier: "market_report", valid_until: "2026-10-12T12:00:00Z" }, "free"],
    ["an unreadable end date", { tier: "market_report", valid_until: "soon" }, "free"],
    ["an unknown tier", { tier: "platinum", valid_until: null }, "free"],
  ])("%s → %s", (_label, row, expected) => {
    expect(effectiveTier(row, NOW)).toBe(expected);
  });
});

test("tiersByClientId keys each client's effective tier", () => {
  const map = tiersByClientId(
    [
      { client_id: "a", tier: "market_report", valid_until: null },
      { client_id: "b", tier: "market_report", valid_until: "2020-01-01T00:00:00Z" },
    ],
    NOW,
  );
  expect(map.get("a")).toBe("market_report");
  expect(map.get("b")).toBe("free");
  expect(map.get("c")).toBeUndefined();
});

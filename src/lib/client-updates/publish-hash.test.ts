import { describe, expect, test } from "vitest";
import { publishHash } from "./publish-hash";

describe("publishHash", () => {
  test("key order doesn't matter (jsonb reorders keys)", () => {
    expect(publishHash({ a: 1, b: { c: [1, { d: 2, e: 3 }] } })).toBe(publishHash({ b: { c: [1, { e: 3, d: 2 }] }, a: 1 }));
  });

  test("any change in content changes it", () => {
    const base = publishHash({ headline: "Ready", payload: { costUsd: 9000 } });
    expect(publishHash({ headline: "Ready", payload: { costUsd: 9001 } })).not.toBe(base);
    expect(publishHash({ headline: "Ready!", payload: { costUsd: 9000 } })).not.toBe(base);
    expect(publishHash({ headline: "Ready", payload: { costUsd: 9000 }, extra: null })).not.toBe(base);
  });
});

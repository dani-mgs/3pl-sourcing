import { describe, expect, test } from "vitest";
import { formatContractPeriod } from "./contract-period";

describe("formatContractPeriod", () => {
  test("plural", () => {
    expect(formatContractPeriod(36)).toBe("36 months");
    expect(formatContractPeriod(120)).toBe("120 months");
  });
  test("singular", () => {
    expect(formatContractPeriod(1)).toBe("1 month");
  });
  test("blank", () => {
    expect(formatContractPeriod(null)).toBeNull();
    expect(formatContractPeriod(undefined)).toBeNull();
  });
});

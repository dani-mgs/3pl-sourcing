import { describe, expect, test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ContractPeriodLine } from "./contract-period-line";

const text = (months: number | null) =>
  renderToStaticMarkup(<ContractPeriodLine months={months} />)
    .replace(/<[^>]+>/g, "")
    .trim();

describe("ContractPeriodLine", () => {
  test("plural", () => {
    expect(text(36)).toBe("Contract period · 36 months");
  });
  test("singular", () => {
    expect(text(1)).toBe("Contract period · 1 month");
  });
  test("renders nothing when blank", () => {
    expect(renderToStaticMarkup(<ContractPeriodLine months={null} />)).toBe("");
  });
});

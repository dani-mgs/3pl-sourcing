import { describe, expect, test } from "vitest";
import { cleanExtractedText } from "./document-extraction";

describe("cleanExtractedText", () => {
  test("passes through a real value unchanged (trimmed)", () => {
    expect(cleanExtractedText("  Cascade Outdoor Gear  ")).toBe(
      "Cascade Outdoor Gear",
    );
  });

  test("returns undefined for the model's own placeholder text", () => {
    expect(cleanExtractedText("<UNKNOWN>")).toBeUndefined();
    expect(cleanExtractedText("unknown")).toBeUndefined();
    expect(cleanExtractedText("N/A")).toBeUndefined();
    expect(cleanExtractedText("Not specified")).toBeUndefined();
    expect(cleanExtractedText("none")).toBeUndefined();
  });

  test("returns undefined for an empty or whitespace-only string", () => {
    expect(cleanExtractedText("")).toBeUndefined();
    expect(cleanExtractedText("   ")).toBeUndefined();
  });

  test("returns undefined when the input is undefined (field omitted)", () => {
    expect(cleanExtractedText(undefined)).toBeUndefined();
  });

  test("a value that merely contains a placeholder word isn't over-matched", () => {
    // "Not Applicable Logistics" isn't itself a placeholder, only the bare
    // token is — this guards against the filter being too aggressive.
    expect(cleanExtractedText("Not Applicable Logistics Inc.")).toBe(
      "Not Applicable Logistics Inc.",
    );
  });
});

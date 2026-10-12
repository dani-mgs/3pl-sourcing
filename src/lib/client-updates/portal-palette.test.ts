import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { PORTAL_COLORS, TEXT_PAIRS } from "./portal-palette";

// WCAG 2 contrast, computed here (no library): every text colour the portal
// uses must reach 4.5:1 on every background it sits on.

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe("portal palette", () => {
  test("the formula matches known values", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrast("#767676", "#ffffff")).toBeCloseTo(4.54, 2);
  });

  test.each(TEXT_PAIRS)("%s on %s is at least 4.5:1", (text, background) => {
    expect(contrast(text, background)).toBeGreaterThanOrEqual(4.5);
  });

  test("the CSS tokens match", () => {
    const css = readFileSync(join(process.cwd(), "src/styles/globals.css"), "utf8");
    for (const [name, value] of Object.entries(PORTAL_COLORS)) {
      expect(css, name).toContain(`--color-portal-${name}: ${value};`);
    }
  });
});

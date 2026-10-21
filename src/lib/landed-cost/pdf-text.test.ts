import { describe, expect, test } from "vitest";
import { isDrawable, pdfText, undrawable } from "./pdf-text";

// What pdfkit's built-in Helvetica can draw (Windows-1252): everything else
// in typed text becomes "?" and is flagged; our own symbols become words.

describe("isDrawable", () => {
  test("ASCII, Latin-1 and the Windows-1252 extras", () => {
    for (const c of ["A", "z", "0", "$", "é", "ñ", "Ü", "·", "×", "³", "€", "…", "—", "–", "‘", "’", "“", "”", "•", "™", "Œ", "ž", "\n"]) {
      expect(isDrawable(c), c).toBe(true);
    }
  });

  test("not arrows, maths symbols, CJK, emoji or control characters", () => {
    for (const c of ["→", "≥", "−", "陶", "★", "😀", "\u0007", "ā"]) expect(isDrawable(c), c).toBe(false);
  });
});

describe("pdfText", () => {
  test("typed text: ? for each character it can't draw, and the flag", () => {
    const t = pdfText();
    expect(t.user("Café Ningbo")).toBe("Café Ningbo");
    expect(t.replaced()).toBe(false);
    expect(t.user("Mug 陶瓷杯 😀")).toBe("Mug ??? ?");
    expect(t.replaced()).toBe(true);
    expect(t.user(null)).toBe("");
  });

  test("composed accents are kept (NFC), tabs and CRLF tidied", () => {
    const t = pdfText();
    expect(t.user("Café\tok\r\nnext")).toBe("Café ok\nnext");
    expect(t.replaced()).toBe(false);
  });

  test("our own symbols become words, never ?, and don't set the flag", () => {
    const t = pdfText();
    expect(t.own("China → US, ≥ 10, −5")).toBe("China  to  US, at least  10, -5");
    expect(undrawable(t.own("A → B ≤ C ✓"))).toEqual([]);
    expect(t.replaced()).toBe(false);
  });
});

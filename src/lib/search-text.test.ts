import { describe, expect, test } from "vitest";
import { foldForSearch, matchesSearch } from "./search-text";

describe("foldForSearch", () => {
  test("drops accents and case", () => {
    expect(foldForSearch("ZZQA Café & Crème Ünïcödé 🚚 Ltd")).toBe("zzqa cafe & creme unicode 🚚 ltd");
    expect(foldForSearch("Trần São Paulo Zürich Ñandú")).toBe("tran sao paulo zurich nandu");
  });

  test("leaves letters that don't decompose, and emoji, alone", () => {
    expect(foldForSearch("Straße Øresund Łódź 🚢")).toBe("straße øresund łodz 🚢");
  });
});

describe("matchesSearch", () => {
  test("finds accented names from plain typing (B-6 repro)", () => {
    expect(matchesSearch("ZZQA Café & Crème Ünïcödé 🚚 Ltd", "zzqa cafe")).toBe(true);
    expect(matchesSearch("ZZQA Café & Crème Ünïcödé 🚚 Ltd", "creme")).toBe(true);
    expect(matchesSearch("ZZQA Café & Crème Ünïcödé 🚚 Ltd", "CAFÉ")).toBe(true);
  });

  test("still needs the text to contain the query", () => {
    expect(matchesSearch("Acme Co", "cafe")).toBe(false);
    expect(matchesSearch(null, "cafe")).toBe(false);
  });

  test("a blank query matches everything, even a missing field", () => {
    expect(matchesSearch("Acme", "  ")).toBe(true);
    expect(matchesSearch(null, "")).toBe(true);
  });
});

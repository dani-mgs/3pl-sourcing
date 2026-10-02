// HTS codes as typed by people ("7208.10.15.00", "7208 10 15", "7208101500")
// and as stored (digits only). Classification is the importer's
// responsibility: the app looks up the code it's given and never suggests one.

export type HtsCodeResult =
  | { ok: true; digits: string }
  | { ok: false; error: string };

export function normalizeHtsCode(input: string): HtsCodeResult {
  const trimmed = input.trim();
  if (!/^[0-9.\s-]+$/.test(trimmed)) {
    return { ok: false, error: "Enter the HTS code as digits, e.g. 7208.10.15.00." };
  }
  const digits = trimmed.replace(/[.\s-]/g, "");
  if (digits.length !== 8 && digits.length !== 10) {
    return {
      ok: false,
      error: "Enter an 8- or 10-digit HTS code (10 digits recommended), e.g. 7208.10.15.00.",
    };
  }
  const chapter = digits.slice(0, 2);
  if (chapter === "98" || chapter === "99") {
    return {
      ok: false,
      error: "Chapter 98 and 99 provisions aren't supported. Enter the product's chapter 1–97 code.",
    };
  }
  if (chapter === "00" || chapter === "77") {
    return { ok: false, error: "That isn't an HTS chapter. Check the code and try again." };
  }
  return { ok: true, digits };
}

// "7208101500" → "7208.10.15.00"; "72081015" → "7208.10.15".
export function formatHtsCode(digits: string): string {
  const parts = [digits.slice(0, 4), digits.slice(4, 6), digits.slice(6, 8), digits.slice(8, 10)];
  return parts.filter(Boolean).join(".");
}

// Section 232 metals from the HTS chapter 99 PDF text (lines from
// notesLines()):
//   - U.S. note 16(c)(i)-(xi): the lists headings 9903.82.02-.26 apply to;
//   - U.S. note 19(g), (i), (j), (k): the lists headings 9903.85.67/.68
//     (aluminium of Russia, 200%) refer to;
//   - U.S. note 35(a)-(c): civil aircraft articles of the UK, Japan and
//     Taiwan that 9903.96.01-.03 take out of 232.

import { block, blockText, digits, findLine, listCodes, location } from "./hts-notes.mjs";

export const NOTE16_LISTS = [
  ["i", "(i) Articles of aluminum:", "aluminum"],
  ["ii", "(ii) Derivative aluminum articles:", "aluminum"],
  ["iii", "(iii) Articles of steel:", "steel"],
  ["iv", "(iv) Derivative steel articles:", "steel"],
  ["v", "(v) Articles of copper:", "copper"],
  ["vi", "(vi) Derivative aluminum articles:", "aluminum"],
  ["vii", "(vii) Derivative steel articles:", "steel"],
  ["viii", "(viii) Articles of copper:", "copper"],
  ["ix", "(ix) Derivative aluminum articles:", "aluminum"],
  ["x", "(x) Derivative steel articles:", "steel"],
  ["xi", "(xi) Derivative steel articles:", "steel"],
];

export function note16Lists(lines) {
  const n16 = findLine(lines, "16. (a) Except as provided in headings 9903.82.01");
  const out = {};
  let from = n16;
  NOTE16_LISTS.forEach(([sub, start], i) => {
    const end = i + 1 < NOTE16_LISTS.length ? NOTE16_LISTS[i + 1][1] : "(d) Headings 9903.82.04 and 9903.82.05 apply";
    const b = block(lines, start, end, from);
    from = b.end;
    out[sub] = listCodes(b.lines, `16(c)(${sub})`);
  });
  return out;
}

// Codes written inline in prose ("… provided for in heading 7601; …",
// "7610.10.00; 7610.90.00; …"), skipping chapter 98/99 provisions.
function inlineCodes(blockLines, note, pattern = /\b(\d{4}(?:\.\d{2}(?:\.\d{2}(?:\d{2})?)?)?)\b/g) {
  const out = [];
  const seen = new Set();
  for (const line of blockLines) {
    for (const m of line.text.matchAll(pattern)) {
      const code = m[1];
      if (code.startsWith("98") || code.startsWith("99") || seen.has(code)) continue;
      seen.add(code);
      out.push({ code, prefix: digits(code), location: location(line, note) });
    }
  }
  return out;
}

const FULL_CODE = /\b(\d{4}\.\d{2}\.\d{2}(?:\d{2})?)\b/g;

export function note19Lists(lines) {
  const n19 = findLine(lines, "19. (a) This note and the tariff provisions referred to herein");
  const g = block(lines, "(g) The rates of duty set forth in heading 9903.85.02 apply", "(h) Except as provided in heading 9903.96.02", n19);
  // (g) names headings in prose ("unwrought aluminum provided for in heading
  // 7601"); its first line also mentions the heading 9903.85.02 itself.
  const aluminum = inlineCodes(g.lines.slice(1), "19(g)", /\b(76\d{2}(?:\.\d{2}\.\d{2})?)\b/g);
  const i = block(lines, "(i) The rates of duty set forth in heading 9903.85.04 apply", "(j) The rates of duty set forth in heading 9903.85.07", n19);
  const j = block(lines, "(j) The rates of duty set forth in heading 9903.85.07", "(k) The rates of duty in heading 9903.85.08", n19);
  const k = block(lines, "(k) The rates of duty in heading 9903.85.08", "(l) Any importer entering the aluminum products", n19);
  const stripFirst = (b) => [{ ...b.lines[0], text: b.lines[0].text.replace(/heading 9903\.\d{2}\.\d{2}/g, "") }, ...b.lines.slice(1)];
  return {
    aluminum,
    derivatives: [
      ...inlineCodes(stripFirst(i), "19(i)", FULL_CODE),
      ...inlineCodes(stripFirst(j), "19(j)", FULL_CODE),
      ...inlineCodes(stripFirst(k), "19(k)", FULL_CODE),
    ],
  };
}

export function note35Lists(lines) {
  const n35 = findLine(lines, "35. [Compiler's note");
  const a = block(lines, "(a) As provided in heading 9903.96.01", "(b) As provided in heading 9903.96.02", n35);
  const b = block(lines, "(b) As provided in heading 9903.96.02", "(c) As provided in heading 9903.96.03", n35);
  const c = block(lines, "(c) As provided in heading 9903.96.03", "36. [Note deleted.]", n35);
  // The lists follow "… appears in the "Special" subcolumn:"; the intro
  // names chapter 99 headings only, which inlineCodes skips.
  const after = (bl) => {
    const text = blockText(bl.lines);
    if (!/sub-?column:/.test(text)) throw new Error("U.S. note 35: list intro not found");
    return bl.lines;
  };
  return {
    GB: inlineCodes(after(a), "35(a)", FULL_CODE),
    JP: inlineCodes(after(b), "35(b)", FULL_CODE),
    TW: listCodes(c.lines, "35(c)"),
  };
}

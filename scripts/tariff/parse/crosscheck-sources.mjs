// Parsers for the second, independent sources the extracted lists are
// checked against (never loaded into the seed):
//   - USITC "China Tariffs" reference table (PDF text): code → heading;
//   - CBP CSMS #68855869 metals list (Word text): codes by chapter 99
//     heading and note 16 subdivision;
//   - USTR four-year review notices (Federal Register XML): U.S. note 31 as
//     implemented, with the later amendments those notices make.

import { federalRegisterText } from "../lib/text.mjs";

const digits = (code) => code.replace(/\./g, "");

// "8401.10.00 \t9903.88.03" rows, with the PDF page each was read on.
export function usitcChinaTable(text) {
  const rows = [];
  let page = 1;
  for (const line of text.split("\n")) {
    const end = /^-- (\d+) of \d+ --$/.exec(line.trim());
    if (end) {
      page = Number(end[1]) + 1;
      continue;
    }
    const m = /^(\d{4}\.\d{2}\.\d{2}(?:\d{2})?)\s+(9903\.\d{2}\.\d{2})\s*$/.exec(line.trim());
    if (m) rows.push({ code: m[1], prefix: digits(m[1]), heading: m[2], location: `USITC China Tariffs (Jan 1, 2026) PDF p. ${page}` });
  }
  // The intro states when each heading took effect.
  const effective = {};
  const intro = text.slice(0, 4000).replace(/\s+/g, " ");
  for (const m of intro.matchAll(/headings? ((?:9903\.\d{2}\.\d{2}(?:, | and |,? and )?)+) became effective on (\w+ \d{1,2}, \d{4})/g)) {
    for (const h of m[1].match(/9903\.\d{2}\.\d{2}/g)) effective[h] = m[2];
  }
  return { rows, effective };
}

const ROMAN = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x", "xi"];

// Sections start "9903.82.02:" (or "9903.82.07 and 9903.82.08", "9903.82.12
// (Belarus, …):"); subsections "(ix)Derivative aluminum articles:" or just
// "Articles of steel:"; codes are tab-separated.
export function cbpMetalsList(text) {
  const sections = [];
  let section = null;
  let sub = null;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (/^9903\.8[25]\.\d{2}[^\t]*$/.test(line)) {
      // The title names the section's headings before any colon ("9903.82.23,
      // 9903.82.24, 9903.82.25, 9903.82.26: Except for 9903.85.68, …").
      const names = line.split(":")[0].match(/9903\.8[25]\.\d{2}/g);
      section = { headings: [...new Set(names)], title: line, subs: [] };
      sections.push(section);
      sub = null;
      continue;
    }
    const label = /^(?:\(([ivx]+)\)\s*)?((?:Derivative )?(?:aluminum|steel|copper) articles|Articles of (?:aluminum|steel|copper))(?:\s*\([A-Z]{2}\))?\s*:/i.exec(line);
    if (label && section) {
      sub = { roman: label[1] && ROMAN.includes(label[1]) ? label[1] : null, label: label[2], codes: [] };
      section.subs.push(sub);
      continue;
    }
    if (!sub) continue;
    for (const token of line.split(/\s+/)) {
      if (/^\d{4}(?:\.\d{2}(?:\.\d{2}(?:\d{2})?)?)?$/.test(token)) sub.codes.push(token);
    }
  }
  return sections;
}

// U.S. note 31 as USTR implemented it: the note inserted by FR 2024-21217
// (subdivisions (b)-(i), numbered "(n) code" items), then the amendments in
// that notice and in FR 2024-29462. Each amendment pattern must be found,
// so a change in the notices' text fails loudly instead of being skipped.
export function frNote31(xml21217, xml29462) {
  const a = federalRegisterText(xml21217);
  const b = federalRegisterText(xml29462);
  const start = a.indexOf("“31. (a) As provided in headings 9903.91.01");
  // The note is inserted in several quoted parts; it runs to the next
  // numbered instruction of the annex.
  const end = a.indexOf(" 5. Effective", start);
  if (start < 0 || end < 0) throw new Error("FR 2024-21217: inserted note 31 not found");
  const note = a.slice(start, end);
  const subdivision = (letter, next) => {
    const i = note.indexOf(`(${letter}) Heading 9903.91.`);
    const j = next ? note.indexOf(`(${next}) Heading 9903.91.`, i + 1) : note.length;
    if (i < 0) throw new Error(`FR 2024-21217 note 31(${letter}) not found`);
    const text = note.slice(i, j < 0 ? note.length : j);
    return [...text.matchAll(/\((\d+)\) (\d{4}\.\d{2}\.\d{2}(?:\d{2})?)/g)].map((m) => ({ n: Number(m[1]), code: m[2] }));
  };
  const statNumbers = (letter, next) => {
    const i = note.indexOf(`(${letter}) Heading 9903.91.`);
    const j = next ? note.indexOf(`(${next}) Heading 9903.91.`, i + 1) : note.length;
    return [...note.slice(i, j).matchAll(/\b(\d{4}\.\d{2}\.\d{4})\b/g)].map((m) => ({ code: m[1] }));
  };
  const subs = {
    "9903.91.01": subdivision("b", "c"),
    "9903.91.02": subdivision("c", "d"),
    "9903.91.03": subdivision("d", "e"),
    "9903.91.05": subdivision("f", "g"),
    "9903.91.06": subdivision("g", "h"),
    "9903.91.07": statNumbers("h", "i"),
    "9903.91.08": [...note.slice(note.indexOf("(i) Heading 9903.91.08")).matchAll(/subheading (\d{4}\.\d{2}\.\d{2})/g)].slice(0, 1).map((m) => ({ code: m[1] })),
  };
  const applied = [];
  const need = (text, phrase, what) => {
    if (!text.includes(phrase)) throw new Error(`Amendment not found (${what}): ${phrase}`);
    applied.push(what);
  };
  // FR 2024-21217 Annex C item 21: (b) numbers (1)-(4) deleted (Jan 1, 2026).
  need(a, "subdivision (b) of note 31 to subchapter III of chapter 99 of the HTSUS is modified by deleting subparagraph numbers 1, 2, 3, and 4", "FR 2024-21217: 31(b)(1)-(4) deleted from January 1, 2026");
  subs["9903.91.01"] = subs["9903.91.01"].filter((x) => x.n > 4);
  // FR 2024-29462 Annex B: (j) inserted; 2804.61.00 and 3818.00.00 moved from
  // note 20(f) into 31(f); 4015.12.10 deleted from 31(f) on January 1, 2026.
  need(b, "by inserting the following new subdivision (j) to note 31", "FR 2024-29462: 31(j) inserted");
  subs["9903.91.11"] = [...b.slice(b.indexOf("new subdivision (j) to note 31")).matchAll(/\((\d+)\) (\d{4}\.\d{2}\.\d{2})/g)]
    .slice(0, 3)
    .map((m) => ({ n: Number(m[1]), code: m[2] }));
  need(b, "inserting “(1) 2804.61.00” and “(2) 3818.00.00”", "FR 2024-29462: 2804.61.00 and 3818.00.00 added to 31(f)");
  subs["9903.91.05"].push({ code: "2804.61.00" }, { code: "3818.00.00" });
  need(b, "subdivision (f) of note 31 to subchapter III of chapter 99 of the HTSUS is modified by deleting “(3) 4015.12.10”", "FR 2024-29462: 4015.12.10 deleted from 31(f)");
  subs["9903.91.05"] = subs["9903.91.05"].filter((x) => x.code !== "4015.12.10");
  return { subs, applied };
}

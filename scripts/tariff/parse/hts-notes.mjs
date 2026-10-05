// U.S. notes to chapter 99 from the HTS PDF text (pdf-parse output).
//
// The text keeps each printed line; pages end with a "-- N of M --" line and
// carry running heads/feet ("Harmonized Tariff Schedule…", "99 - III - 89",
// "U.S. Notes (con.)"). notesLines() drops those and tags every remaining
// line with its PDF page and printed page label, so each extracted code can
// cite exactly where it was read.

const RUNNING = [
  /^Harmonized Tariff Schedule of the United States/,
  /^Annotated for Statistical Reporting Purposes$/,
  /^XXII$/,
  /^99 - [IVX]+ - \d+$/,
  /^-- \d+ of \d+ --$/,
  /^U\.S\. Notes \(con\.\)$/,
];

export function notesLines(text) {
  const out = [];
  let pageLines = [];
  let label = null;
  const flush = (page) => {
    for (const l of pageLines) out.push({ text: l, page, label });
    pageLines = [];
    label = null;
  };
  for (const raw of text.split("\n")) {
    const line = raw.replace(/\s+$/, "");
    const end = /^-- (\d+) of \d+ --$/.exec(line);
    if (end) {
      flush(Number(end[1]));
      continue;
    }
    const foot = /^99 - ([IVX]+) - (\d+)$/.exec(line);
    if (foot) label = `99-${foot[1]}-${foot[2]}`;
    if (line.trim() === "" || RUNNING.some((r) => r.test(line.trim()))) continue;
    pageLines.push(line);
  }
  flush(null);
  return out;
}

// Index of the first line at or after `from` whose text starts with `prefix`.
export function findLine(lines, prefix, from = 0) {
  for (let i = from; i < lines.length; i++) if (lines[i].text.startsWith(prefix)) return i;
  throw new Error(`Line starting "${prefix}" not found after line ${from}`);
}

// Lines from the one starting `start` up to (not including) the one starting
// `end`, searching from `from`.
export function block(lines, start, end, from = 0) {
  const i = findLine(lines, start, from);
  const j = findLine(lines, end, i + 1);
  return { lines: lines.slice(i, j), start: i, end: j };
}

const CODE = /^\d{4}(?:\.\d{2}(?:\.\d{2}(?:\d{2})?)?)?$/;
export const digits = (code) => code.replace(/\./g, "");

export function location(line, note) {
  return `HTS 2026 Rev. 20 ch. 99 PDF p. ${line.page}${line.label ? ` (${line.label})` : ""}, U.S. note ${note}`;
}

// Codes from the list lines of a block: rows of tab-separated codes
// ("8401.20.00\t8401.10.00\t…") or numbered ones ("(12) 8541.42.00").
// Chapter 99 codes (9903.xx cross-references in the prose) are skipped.
export function listCodes(blockLines, note) {
  const out = [];
  for (const line of blockLines) {
    const numbered = /^\(\d+\)\s+(\d{4}\.\d{2}\.\d{2}(?:\d{2})?)$/.exec(line.text.trim());
    const tokens = numbered ? [numbered[1]] : line.text.trim().split(/\s+/);
    if (!tokens.every((t) => CODE.test(t))) continue;
    for (const t of tokens) {
      if (t.startsWith("99")) continue;
      out.push({ code: t, prefix: digits(t), location: location(line, note) });
    }
  }
  return out;
}

// The block's text as one string (wrapped lines joined), for prose items.
export function blockText(blockLines) {
  return blockLines.map((l) => l.text.trim()).join(" ").replace(/\s+/g, " ");
}

// Numbered prose items: "1. Other printed books …, provided for in
// subheading 4901.99.00, except for such printed matter provided for in
// statistical reporting number 4901.99.0040;". Returns the 8-digit (or
// 10-digit) code it covers and the statistical numbers it excepts, with the
// page of the line the item starts on.
export function proseItems(blockLines, note) {
  const items = [];
  let current = null;
  for (const line of blockLines) {
    const start = /^(\d{1,3})\.\s+(.*)$/.exec(line.text.trim());
    if (start) {
      current = { n: Number(start[1]), text: start[2], line };
      items.push(current);
    } else if (current) {
      current.text += ` ${line.text.trim()}`;
    }
  }
  return items.map(({ n, text, line }) => {
    // The covered code is the first "provided for in [subheading] X"; the
    // statistical numbers after it, in its "except …" clause, are excepted
    // ("Other seats of rubber or plastics except for other seats of
    // reinforced … plastics, provided for in [subheading] 9401.80.40, except
    // for such seats provided for in statistical reporting number …").
    const match = /provided\s+for in (?:\[?subheading\]?\s+)?(\d{4}\.\d{2}\.\d{2}(?:\d{2})?)/.exec(text);
    if (!match) throw new Error(`U.S. note ${note}, item ${n}: no covered subheading in "${text.slice(0, 120)}"`);
    const covered = match[1];
    const rest = text.slice(match.index + match[0].length);
    const excepted = /\bexcept\b/.test(rest) ? [...rest.matchAll(/\b(\d{4}\.\d{2}\.\d{4})\b/g)].map((m) => m[1]) : [];
    return { n, text, covered, excepted, location: `${location(line, note)}, item ${n}` };
  });
}

// "(n) …" items, possibly spanning lines (exclusion descriptions, note 31(h)).
export function parenItems(blockLines) {
  const items = [];
  let current = null;
  for (const line of blockLines) {
    const start = /^\((\d{1,3})\)\s*(.*)$/.exec(line.text.trim());
    if (start) {
      current = { n: Number(start[1]), text: start[2], line };
      items.push(current);
    } else if (current) {
      current.text += ` ${line.text.trim()}`;
    }
  }
  return items.map((i) => ({ ...i, text: i.text.replace(/\s+/g, " ").trim() }));
}

// Where a chapter 99 heading's own row is printed: the last line that is
// exactly the heading number (the tariff rows follow the notes, which only
// mention headings inside sentences). For citing "page N" of the PDF.
export function headingLocation(lines, heading) {
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].text.trim() === heading) return { page: lines[i].page, label: lines[i].label };
  }
  throw new Error(`Heading row ${heading} not found`);
}

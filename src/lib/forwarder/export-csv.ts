// Hand-written CSV building — RFC4180-style escaping, no dependency. Pure,
// no I/O, so it's directly unit-testable rather than only browser-verified.

// A field is quoted whenever it contains a comma, a double quote, or a
// newline; any double quote inside it is doubled ("" per RFC4180). Anything
// else is written as-is.
export function escapeCsvField(value: string | number | null | undefined): string {
  if (value == null) return "";
  const text = String(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function toCsvRow(values: (string | number | null | undefined)[]): string {
  return values.map(escapeCsvField).join(",");
}

// CRLF line endings for spreadsheet-app compatibility (Excel expects them).
export function buildCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  return [toCsvRow(headers), ...rows.map(toCsvRow)].join("\r\n") + "\r\n";
}

// Stacks several already-built section CSVs into one file: a plain title
// line, that section's header+rows, a blank line, then the next section.
// Each `csv` is expected to already end in "\r\n" (as buildCsv's output
// does), so joining with "\r\n" produces exactly one blank line between
// sections.
export function buildMultiSectionCsv(sections: { title: string; csv: string }[]): string {
  return sections.map((s) => `${s.title}\r\n${s.csv}`).join("\r\n");
}

// Filesystem/download-safe filename: strip characters that upset a Save As
// dialog on any platform, collapse whitespace, cap length generously.
export function sanitizeFilename(name: string): string {
  const cleaned = name
    .replace(/[/\\?%*:|"<>]/g, "")
    .trim()
    .replace(/\s+/g, "-");
  return cleaned.slice(0, 120) || "export";
}

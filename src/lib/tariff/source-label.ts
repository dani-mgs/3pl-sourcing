// A one-line form of a duty row's source label for the Duty data table:
// "HTS heading 9903.88.01 and U.S. note 20(a)-(b) (2026 Rev. 20)" becomes
// "HTS 9903.88.01 · note 20(a)–(b) · Rev. 20". Anything after the first ";"
// (e.g. "Proclamation 11021 as adjusted June 8, 2026") is left out; the full
// label is always shown on hover and read by screen readers. Labels that
// don't follow the usual pattern come back with only whitespace tidied.
// Display only; the stored label never changes.

export function compactSourceLabel(label: string): string {
  let main = label.split(";")[0].replace(/\s+/g, " ").trim();
  const parts: string[] = [];

  let revision: string | null = null;
  main = main.replace(/\s*\((?:\d{4} )?(Rev\. \d+)\)/, (_m, rev: string) => {
    revision = rev;
    return "";
  });
  let fr: string | null = null;
  main = main.replace(/,\s*(FR \d{4}-\d+)\s*$/, (_m, ref: string) => {
    fr = ref;
    return "";
  });

  main = main
    .replace(/\bHTS (?:sub)?headings? /g, "HTS ")
    .replace(/ and U\.S\. note /g, " · note ")
    .replace(/^U\.S\. note /, "note ")
    // Ranges: "(a)-(b)" and "9903.82.20-.21" take an en dash.
    .replace(/\)-\(/g, ")–(")
    .replace(/(\d)-\./g, "$1–.")
    .trim();

  parts.push(main);
  if (revision) parts.push(revision);
  if (fr) parts.push(fr);
  return parts.filter(Boolean).join(" · ");
}

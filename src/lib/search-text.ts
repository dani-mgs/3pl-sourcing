// Search text compared the way people type it: case- and accent-insensitive,
// so "cafe" finds "Café" and "creme" finds "Crème" (QA B-6). NFD splits an
// accented letter into the letter and its combining mark, which is dropped.
// Letters with no decomposition (ß, ø, ł) are left as they are.
export function foldForSearch(text: string): string {
  return text.normalize("NFD").replace(/\p{Mn}/gu, "").toLowerCase();
}

// Does the text contain the query, folded? A blank query matches everything.
export function matchesSearch(text: string | null | undefined, query: string): boolean {
  const q = foldForSearch(query.trim());
  if (!q) return true;
  return text != null && foldForSearch(text).includes(q);
}

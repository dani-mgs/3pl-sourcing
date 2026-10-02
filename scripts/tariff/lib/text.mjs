// Turning the sources into plain text.

// Federal Register "full text" pages (federalregister.gov/documents/full_text/
// text/...): HTML around a <pre> block. Tags and page markers are removed and
// whitespace collapsed, so wrapped lines read as one paragraph.
export function federalRegisterText(html) {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\[\[Page \d+\]\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// PDF text with pdf-parse (already a dependency for uploads). Pages are
// separated by "-- N of M --" lines, which the note parsers use to cite the
// page a code comes from.
export async function pdfText(bytes) {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: new Uint8Array(bytes) });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}

// Word documents with mammoth (already a dependency): paragraphs on their own
// lines, tab stops kept as \t.
export async function docxText(bytes) {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
  return result.value;
}

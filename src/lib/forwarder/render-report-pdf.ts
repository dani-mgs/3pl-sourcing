import PDFDocument from "pdfkit";
import type { CellValue, ForwarderReport, ReportSection } from "./report-data";

// Plain, readable PDF rendering of a ForwarderReport — one heading style, one
// record-drawing routine, no per-field styling or templating layer.
//
// A "table" section (Forwarders Considered, Quote Comparison) is rendered as
// one stacked label:value block per row rather than a wide grid: the widest
// of these tables has ~26 columns (11 capability booleans plus several free-
// text fields), and no reasonable page width keeps every column's longest
// word intact at a readable font size — an earlier grid-based version was
// caught (by render-report-pdf.test.ts's pdf-parse round-trip) hard-breaking
// words like "Confidential" into unreadable fragments. Stacked blocks have no
// column-width ceiling, so this reads correctly regardless of how many fields
// a section has. Portrait Letter throughout — no landscape switch needed
// without wide grids.

const NAVY = "#192E5B";
const MUTED = "#6B7280";
const BORDER = "#E5E7EB";
const MARGIN = 50;
const LABEL_SIZE = 9;
const LINE_GAP = 4;

// pdfkit's built-in Helvetica font uses WinAnsiEncoding (Windows-1252), which
// has no glyph for characters like the route arrow "→" — drawing them renders
// as corrupted glyphs (caught live: a route's "→" turned into garbage in the
// header). WinAnsi does cover accented Latin characters and "·"/em dash fine,
// so this only needs to catch the specific symbols this app actually
// produces, not a general Unicode transliteration table.
const PDF_UNSUPPORTED_CHARS: [RegExp, string][] = [
  [/→/g, "->"],
  [/←/g, "<-"],
  [/↔/g, "<->"],
];

function pdfSafeText(text: string): string {
  return PDF_UNSUPPORTED_CHARS.reduce((t, [pattern, replacement]) => t.replace(pattern, replacement), text);
}

function cellText(value: CellValue): string {
  return value == null || value === "" ? "" : pdfSafeText(String(value));
}

function bottomLimit(doc: PDFKit.PDFDocument): number {
  return doc.page.height - MARGIN;
}

function newPage(doc: PDFKit.PDFDocument) {
  doc.addPage({ size: "letter", layout: "portrait", margin: MARGIN });
}

// Draws one label: value line, paginating first if it wouldn't fit.
function drawPair(doc: PDFKit.PDFDocument, label: string, value: CellValue) {
  const text = cellText(value);
  const labelText = `${pdfSafeText(label)}: `;
  doc.font("Helvetica-Bold").fontSize(LABEL_SIZE);
  const labelWidth = doc.widthOfString(labelText);
  const valueWidth = doc.page.width - MARGIN * 2 - labelWidth;
  doc.font("Helvetica");
  const lineHeight = Math.max(doc.heightOfString(text, { width: valueWidth }), 12);

  if (doc.y + lineHeight + LINE_GAP > bottomLimit(doc)) {
    newPage(doc);
  }

  const y = doc.y;
  doc.font("Helvetica-Bold").fillColor(NAVY).text(labelText, MARGIN, y, { continued: true });
  doc.font("Helvetica").fillColor("#000000").text(text, { width: valueWidth });
  doc.y = Math.max(doc.y, y + lineHeight) + LINE_GAP;
}

function drawKeyValueList(doc: PDFKit.PDFDocument, pairs: { label: string; value: CellValue }[]) {
  for (const { label, value } of pairs) {
    drawPair(doc, label, value);
  }
  doc.y += 8;
}

// One stacked block per row, headed by its first non-empty identifying value
// (e.g. a company name, or "scenario group — forwarder name"), then every
// other field as label: value. A thin rule separates records.
function drawRecordList(doc: PDFKit.PDFDocument, headers: string[], rows: CellValue[][]) {
  if (rows.length === 0) {
    doc.font("Helvetica").fontSize(LABEL_SIZE).fillColor(MUTED).text("None.", MARGIN, doc.y);
    doc.y += 14;
    return;
  }

  rows.forEach((row, index) => {
    const pairs = headers
      .map((label, i) => ({ label, value: row[i] }))
      .filter((p) => p.value != null && p.value !== "");

    if (doc.y + 20 > bottomLimit(doc)) newPage(doc);

    drawKeyValueList(doc, pairs);

    if (index < rows.length - 1) {
      doc
        .moveTo(MARGIN, doc.y - 4)
        .lineTo(doc.page.width - MARGIN, doc.y - 4)
        .strokeColor(BORDER)
        .stroke();
      doc.y += 4;
    }
  });
}

function drawSectionHeading(doc: PDFKit.PDFDocument, title: string) {
  if (doc.y + 30 > bottomLimit(doc)) newPage(doc);
  doc.font("Helvetica-Bold").fontSize(13).fillColor(NAVY).text(pdfSafeText(title), MARGIN, doc.y);
  doc.y += 4;
  doc
    .moveTo(MARGIN, doc.y)
    .lineTo(doc.page.width - MARGIN, doc.y)
    .strokeColor(BORDER)
    .stroke();
  doc.y += 10;
}

export async function renderForwarderReportPdf(report: ForwarderReport): Promise<Buffer> {
  const doc = new PDFDocument({ size: "letter", margin: MARGIN, layout: "portrait" });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });

  doc.font("Helvetica-Bold").fontSize(18).fillColor(NAVY).text(pdfSafeText(report.clientName), MARGIN, MARGIN);
  doc.font("Helvetica").fontSize(10).fillColor(MUTED);
  const subtitleParts = [report.route, report.versionLabel, `Generated ${report.generatedOn}`].filter(
    (p): p is string => Boolean(p),
  );
  doc.text(pdfSafeText(subtitleParts.join("  ·  ")));
  doc.y += 16;

  for (const section of report.sections as ReportSection[]) {
    drawSectionHeading(doc, section.title);
    if (section.kind === "keyvalue") {
      drawKeyValueList(doc, section.pairs);
    } else {
      drawRecordList(doc, section.headers, section.rows);
    }
  }

  doc.end();
  return done;
}

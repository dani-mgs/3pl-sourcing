import PDFDocument from "pdfkit";
import type { ReportBlock, ReportColumn, VersionReport } from "./version-report";

// Draws a locked version's report (version-report.ts) with pdfkit: US Letter
// portrait, Helvetica (so every string arrives already limited to what it can
// draw, pdf-text.ts). Tables wrap long text and break between rows, never
// inside one, repeating their header on the next page; money is
// right-aligned. Footers ("Page X of Y" and the disclaimer) are written once
// every page exists. The creation date is the version's, so the same version
// always gives the same file.

const NAVY = "#192E5B";
const MUTED = "#6B7280";
const BORDER = "#D1D5DB";
const AMBER_BG = "#FFFBEB";
const AMBER = "#92400E";
const MARGIN = 48;
const FOOTER_HEIGHT = 34;
const BODY = 9;
const TABLE = 8;
const CELL_PAD = 3;

type Doc = PDFKit.PDFDocument;

const contentWidth = (doc: Doc) => doc.page.width - MARGIN * 2;
const bottom = (doc: Doc) => doc.page.height - MARGIN - FOOTER_HEIGHT;
const newPage = (doc: Doc) => doc.addPage({ size: "letter", layout: "portrait", margin: MARGIN });
function ensure(doc: Doc, height: number) {
  if (doc.y + height > bottom(doc)) newPage(doc);
}

function heading(doc: Doc, text: string, level: 1 | 2 | 3, forceNewPage: boolean) {
  if (forceNewPage) newPage(doc);
  const size = level === 1 ? 14 : level === 2 ? 11 : 9.5;
  doc.font("Helvetica-Bold").fontSize(size);
  // Keep a heading with at least a few lines of what follows.
  ensure(doc, doc.heightOfString(text, { width: contentWidth(doc) }) + 40);
  if (level === 1 && doc.y > MARGIN + 1) doc.y += 6;
  doc.fillColor(NAVY).text(text, MARGIN, doc.y, { width: contentWidth(doc) });
  if (level === 1) {
    doc.moveTo(MARGIN, doc.y + 2).lineTo(MARGIN + contentWidth(doc), doc.y + 2).strokeColor(BORDER).stroke();
    doc.y += 8;
  } else {
    doc.y += 3;
  }
}

function paragraph(doc: Doc, text: string, tone: "normal" | "muted" | "strong" = "normal") {
  doc.font(tone === "strong" ? "Helvetica-Bold" : "Helvetica").fontSize(BODY);
  const h = doc.heightOfString(text, { width: contentWidth(doc) });
  ensure(doc, h);
  doc.fillColor(tone === "muted" ? MUTED : "#111827").text(text, MARGIN, doc.y, { width: contentWidth(doc) });
  doc.y += 4;
}

function list(doc: Doc, items: string[]) {
  doc.font("Helvetica").fontSize(BODY);
  for (const item of items) {
    const text = `•  ${item}`;
    const h = doc.heightOfString(text, { width: contentWidth(doc) - 8 });
    ensure(doc, h);
    doc.fillColor("#111827").text(text, MARGIN + 8, doc.y, { width: contentWidth(doc) - 8 });
    doc.y += 2;
  }
  doc.y += 4;
}

function pairs(doc: Doc, rows: [string, string][]) {
  const labelWidth = 130;
  const valueWidth = contentWidth(doc) - labelWidth;
  doc.fontSize(BODY);
  for (const [label, value] of rows) {
    doc.font("Helvetica");
    const h = Math.max(doc.heightOfString(value, { width: valueWidth }), doc.heightOfString(label, { width: labelWidth - 8 }));
    ensure(doc, h);
    const y = doc.y;
    doc.font("Helvetica-Bold").fillColor(NAVY).text(label, MARGIN, y, { width: labelWidth - 8 });
    doc.font("Helvetica").fillColor("#111827").text(value, MARGIN + labelWidth, y, { width: valueWidth });
    doc.y = y + h + 3;
  }
  doc.y += 4;
}

// One row: every cell measured first, so the row is drawn whole on one page.
function rowHeight(doc: Doc, cells: string[], widths: number[], bold: boolean) {
  doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(TABLE);
  return Math.max(...cells.map((c, i) => doc.heightOfString(c || " ", { width: widths[i] - CELL_PAD * 2 }))) + CELL_PAD * 2;
}

function drawRow(doc: Doc, cells: string[], widths: number[], columns: ReportColumn[], bold: boolean, height: number) {
  const y = doc.y;
  let x = MARGIN;
  doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(TABLE).fillColor(bold ? NAVY : "#111827");
  cells.forEach((cell, i) => {
    doc.text(cell, x + CELL_PAD, y + CELL_PAD, { width: widths[i] - CELL_PAD * 2, align: columns[i].align ?? "left" });
    x += widths[i];
  });
  doc.moveTo(MARGIN, y + height).lineTo(MARGIN + contentWidth(doc), y + height).strokeColor(BORDER).lineWidth(0.5).stroke();
  doc.y = y + height;
}

function table(doc: Doc, columns: ReportColumn[], rows: string[][]) {
  const total = columns.reduce((a, c) => a + c.width, 0);
  const widths = columns.map((c) => (c.width / total) * contentWidth(doc));
  const headers = columns.map((c) => c.header);
  const headerHeight = rowHeight(doc, headers, widths, true);
  const drawHeader = () => drawRow(doc, headers, widths, columns, true, headerHeight);

  const first = rows.length > 0 ? rowHeight(doc, rows[0], widths, false) : 0;
  ensure(doc, headerHeight + first);
  drawHeader();
  if (rows.length === 0) {
    paragraph(doc, "None.", "muted");
    return;
  }
  for (const row of rows) {
    const h = rowHeight(doc, row, widths, false);
    if (doc.y + h > bottom(doc)) {
      newPage(doc);
      drawHeader();
    }
    drawRow(doc, row, widths, columns, false, h);
  }
  doc.y += 8;
}

function block(doc: Doc, b: ReportBlock) {
  switch (b.kind) {
    case "heading":
      return heading(doc, b.text, b.level, b.newPage ?? false);
    case "paragraph":
      return paragraph(doc, b.text, b.tone);
    case "list":
      return list(doc, b.items);
    case "pairs":
      return pairs(doc, b.pairs);
    case "table":
      return table(doc, b.columns, b.rows);
  }
}

function header(doc: Doc, report: VersionReport) {
  doc.font("Helvetica-Bold").fontSize(18).fillColor(NAVY).text(report.title, MARGIN, MARGIN, { width: contentWidth(doc) });
  const [name, ...rest] = report.headerLines;
  doc.font("Helvetica-Bold").fontSize(12).fillColor("#111827").text(name, { width: contentWidth(doc) });
  doc.font("Helvetica").fontSize(BODY).fillColor(MUTED);
  for (const line of rest) doc.text(line, { width: contentWidth(doc) });
  doc.y += 10;

  if (report.banner) {
    const text = [report.banner.title, ...report.banner.lines.map((l) => `•  ${l}`)];
    doc.fontSize(BODY);
    const inner = contentWidth(doc) - 16;
    const h = text.reduce((acc, line, i) => acc + doc.font(i === 0 ? "Helvetica-Bold" : "Helvetica").heightOfString(line, { width: inner }) + 2, 0) + 12;
    ensure(doc, h);
    const y = doc.y;
    doc.rect(MARGIN, y, contentWidth(doc), h).fillAndStroke(AMBER_BG, "#FBBF24");
    doc.y = y + 6;
    text.forEach((line, i) => {
      doc.font(i === 0 ? "Helvetica-Bold" : "Helvetica").fillColor(AMBER).text(line, MARGIN + 8, doc.y, { width: inner });
      doc.y += 2;
    });
    doc.y = y + h + 10;
  }
  if (report.characterNote) paragraph(doc, report.characterNote, "muted");
}

function footers(doc: Doc, report: VersionReport) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    // Writing in the bottom margin mustn't start a new page.
    const margin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    const y = doc.page.height - MARGIN - FOOTER_HEIGHT + 10;
    doc.moveTo(MARGIN, y - 4).lineTo(MARGIN + contentWidth(doc), y - 4).strokeColor(BORDER).lineWidth(0.5).stroke();
    doc.font("Helvetica").fontSize(7.5).fillColor(MUTED);
    doc.text(`${report.footerLabel} · Page ${i - range.start + 1} of ${range.count}`, MARGIN, y, { width: contentWidth(doc), lineBreak: false });
    doc.text(report.disclaimer, MARGIN, y + 11, { width: contentWidth(doc) });
    doc.page.margins.bottom = margin;
  }
}

export async function renderVersionPdf(report: VersionReport): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "letter",
    layout: "portrait",
    margin: MARGIN,
    bufferPages: true,
    info: {
      Title: report.documentTitle,
      Author: "MOVE Supply Chain Decision Hub",
      Creator: "MOVE Supply Chain Decision Hub",
      Producer: "MOVE Supply Chain Decision Hub",
      CreationDate: report.creationDate,
      ModDate: report.creationDate,
    },
  });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  header(doc, report);
  for (const b of report.blocks) block(doc, b);
  footers(doc, report);

  doc.end();
  return done;
}

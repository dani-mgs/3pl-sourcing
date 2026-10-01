import { Document, Packer, Paragraph, TextRun } from "docx";
import type { CellValue, ForwarderReport, ReportSection } from "./report-data";

// Plain, readable DOCX rendering of a ForwarderReport — mirrors
// render-report-pdf.ts's structure and reasoning exactly: a "table" section
// (Forwarders Considered, Quote Comparison) renders as one stacked
// label:value block per row rather than a wide table, since the widest
// section has ~26 columns and no reasonable page width keeps every column
// readable. Portrait Letter throughout, single document section — no
// landscape switch needed without wide tables.

const NAVY = "192E5B";
const MUTED = "6B7280";
const PAGE_SIZE = { width: 12240, height: 15840 }; // Letter, in twips
const MARGIN = 720; // 0.5"

function cellText(value: CellValue): string {
  return value == null || value === "" ? "" : String(value);
}

function headingParagraph(title: string): Paragraph {
  return new Paragraph({
    spacing: { before: 200, after: 120 },
    children: [new TextRun({ text: title, bold: true, color: NAVY, size: 26 })],
  });
}

function keyValueParagraphs(pairs: { label: string; value: CellValue }[]): Paragraph[] {
  return pairs.map(
    ({ label, value }) =>
      new Paragraph({
        spacing: { after: 60 },
        children: [
          new TextRun({ text: `${label}: `, bold: true, color: NAVY, size: 18 }),
          new TextRun({ text: cellText(value), size: 18 }),
        ],
      }),
  );
}

// One stacked block per row (same shape as the PDF renderer's drawRecordList),
// separated by a blank paragraph since docx has no lightweight horizontal
// rule primitive as cheap as pdfkit's moveTo/lineTo.
function recordParagraphs(headers: string[], rows: CellValue[][]): Paragraph[] {
  if (rows.length === 0) {
    return [
      new Paragraph({
        children: [new TextRun({ text: "None.", color: MUTED, size: 18 })],
      }),
    ];
  }

  return rows.flatMap((row, index) => {
    const pairs = headers
      .map((label, i) => ({ label, value: row[i] }))
      .filter((p) => p.value != null && p.value !== "");
    const paragraphs = keyValueParagraphs(pairs);
    if (index < rows.length - 1) {
      paragraphs.push(new Paragraph({ spacing: { after: 160 }, text: "" }));
    }
    return paragraphs;
  });
}

export async function renderForwarderReportDocx(report: ForwarderReport): Promise<Buffer> {
  const children: Paragraph[] = [
    new Paragraph({
      spacing: { after: 80 },
      children: [new TextRun({ text: report.clientName, bold: true, color: NAVY, size: 36 })],
    }),
    new Paragraph({
      spacing: { after: 200 },
      children: [
        new TextRun({
          text: [report.route, report.versionLabel, `Generated ${report.generatedOn}`]
            .filter((p): p is string => Boolean(p))
            .join("  ·  "),
          color: MUTED,
          size: 18,
        }),
      ],
    }),
  ];

  for (const section of report.sections as ReportSection[]) {
    children.push(headingParagraph(section.title));
    if (section.kind === "keyvalue") {
      children.push(...keyValueParagraphs(section.pairs));
    } else {
      children.push(...recordParagraphs(section.headers, section.rows));
    }
  }

  for (const note of report.notes) {
    children.push(
      new Paragraph({
        spacing: { before: 200 },
        children: [new TextRun({ text: note, color: MUTED, size: 16 })],
      }),
    );
  }

  const doc = new Document({
    sections: [
      {
        properties: { page: { size: PAGE_SIZE, margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN } } },
        children,
      },
    ],
  });

  return Packer.toBuffer(doc);
}

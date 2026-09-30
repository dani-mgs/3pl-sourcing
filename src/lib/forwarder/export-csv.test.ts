import { describe, expect, test } from "vitest";
import { buildCsv, buildMultiSectionCsv, escapeCsvField, sanitizeFilename, toCsvRow } from "./export-csv";

describe("escapeCsvField", () => {
  test("passes through a plain value unchanged", () => {
    expect(escapeCsvField("TransPacific Cargo Solutions")).toBe(
      "TransPacific Cargo Solutions",
    );
  });

  test("quotes a value containing a comma", () => {
    expect(escapeCsvField("Acme, Inc.")).toBe('"Acme, Inc."');
  });

  test("quotes and doubles internal quotes", () => {
    expect(escapeCsvField('Say "hello"')).toBe('"Say ""hello"""');
  });

  test("quotes a value containing a newline", () => {
    expect(escapeCsvField("line one\nline two")).toBe('"line one\nline two"');
  });

  test("returns an empty string for null/undefined", () => {
    expect(escapeCsvField(null)).toBe("");
    expect(escapeCsvField(undefined)).toBe("");
  });

  test("stringifies a number without quoting", () => {
    expect(escapeCsvField(3050)).toBe("3050");
  });

  test("prefixes a value starting with = with a leading apostrophe", () => {
    expect(escapeCsvField("=SUM(A1:A10)")).toBe("'=SUM(A1:A10)");
  });

  test("prefixes a value starting with + with a leading apostrophe", () => {
    expect(escapeCsvField("+1 555 0148")).toBe("'+1 555 0148");
  });

  test("prefixes a value starting with - with a leading apostrophe", () => {
    expect(escapeCsvField("-$700.00")).toBe("'-$700.00");
  });

  test("prefixes a value starting with @ with a leading apostrophe", () => {
    expect(escapeCsvField("@cmd")).toBe("'@cmd");
  });

  test("quotes a formula-injection value that also contains a comma", () => {
    expect(escapeCsvField("+cmd|' /C calc'!A0,extra")).toBe(
      '"\'+cmd|\' /C calc\'!A0,extra"',
    );
  });

  test("does not prefix a value where the trigger character isn't first", () => {
    expect(escapeCsvField("Acme = Best")).toBe("Acme = Best");
    expect(escapeCsvField("Cost: -50")).toBe("Cost: -50");
  });
});

describe("toCsvRow", () => {
  test("joins escaped fields with commas", () => {
    expect(toCsvRow(["a", "b, c", 3])).toBe('a,"b, c",3');
  });
});

describe("buildCsv", () => {
  test("builds a full CSV with CRLF line endings and a trailing newline", () => {
    const csv = buildCsv(
      ["Name", "Amount"],
      [
        ["Acme, Inc.", 100],
        ['Say "hi"', 200],
      ],
    );
    expect(csv).toBe(
      'Name,Amount\r\n"Acme, Inc.",100\r\n"Say ""hi""",200\r\n',
    );
  });

  test("handles zero data rows (header only)", () => {
    expect(buildCsv(["A", "B"], [])).toBe("A,B\r\n");
  });
});

describe("buildMultiSectionCsv", () => {
  test("stacks sections with a title line and a blank line between them", () => {
    const section1 = buildCsv(["Name"], [["Acme"]]);
    const section2 = buildCsv(["Company"], [["Beta"]]);
    const combined = buildMultiSectionCsv([
      { title: "PROJECT DETAILS", csv: section1 },
      { title: "FORWARDERS", csv: section2 },
    ]);
    expect(combined).toBe(
      "PROJECT DETAILS\r\nName\r\nAcme\r\n\r\nFORWARDERS\r\nCompany\r\nBeta\r\n",
    );
  });

  test("handles a single section", () => {
    const section = buildCsv(["A"], [["1"]]);
    expect(buildMultiSectionCsv([{ title: "ONE", csv: section }])).toBe(
      "ONE\r\nA\r\n1\r\n",
    );
  });
});

describe("sanitizeFilename", () => {
  test("collapses whitespace to hyphens", () => {
    expect(sanitizeFilename("Cascade Outdoor Gear")).toBe(
      "Cascade-Outdoor-Gear",
    );
  });

  test("strips characters unsafe for a filename", () => {
    expect(sanitizeFilename('A/B\\C?D%E*F:G|H"I<J>K')).toBe("ABCDEFGHIJK");
  });

  test("falls back to a default when nothing is left", () => {
    expect(sanitizeFilename("???")).toBe("export");
  });
});

import { createHash } from "node:crypto";
import { describe, expect, test } from "vitest";
import type { LinkProject, LinkQuote } from "@/lib/tariff/forwarder-link";
import { summarizeLinkedEstimates } from "@/lib/tariff/linked-estimates";
import { baseData, quoteEstimate, storedEstimate } from "./__fixtures__/report-duty-estimates";
import { escapeCsvField } from "./export-csv";
import { buildForwarderReportCsv, dutyEstimateExports, type ForwarderReportData } from "./report-data";

// B-16: the Expert CSV carries every linked duty estimate the project's Duty
// estimates card shows (the latest per quote, and the project's own), in a
// "DUTY ESTIMATES" section read from the stored estimates. Without linked
// estimates, and for the client, the CSV is byte for byte what it was before
// (hashes taken from the code before this change).

const BEFORE = {
  expertNone: "6451ece03bd69ff63edd2f4da33477f2567abf2e933c9ec9c2fcf485d1945464",
  clientNone: "c9cf02e89eb15133bd7ff52dc7d4274ff6c1707ea74e50e075f3f1f61e48c94d",
  // The client CSV with linked estimates: the same as without them.
  clientWith: "c9cf02e89eb15133bd7ff52dc7d4274ff6c1707ea74e50e075f3f1f61e48c94d",
};
const hash = (s: string) => createHash("sha256").update(s).digest("hex");

const PROJECT: LinkProject = {
  id: "p", updated_at: "", hs_code: null, origin_country: null, invoice_value: null, invoice_currency: null,
  current_incoterm: null, current_freight_cost_usd: null, shipment_mode: null, weight_kg: null, units: null,
};
const QUOTES = new Map<string, LinkQuote>([
  ["q", {
    id: "q", updated_at: "", forwarder_id: "f", forwarder_name: "Acme Freight", label: "Sea FCL", shipment_mode: "Sea",
    cost_of_goods_usd: null, duties_taxes_usd: 2500, lead_time_min_days: null, lead_time_max_days: null,
  }],
]);

// As fetchForwarderReportData builds it from the stored rows.
function withEstimates(rows: Record<string, unknown>[]): ForwarderReportData {
  const summaries = summarizeLinkedEstimates(rows, PROJECT, QUOTES);
  return {
    ...baseData(),
    dutyEstimates: new Map(summaries.filter((e) => e.quoteId != null).map((e) => [e.quoteId!, e])),
    dutyEstimateList: dutyEstimateExports(rows, summaries, QUOTES),
  };
}

// The DUTY ESTIMATES section's lines (header first), up to the next blank line.
function section(csv: string): string[] {
  const lines = csv.split("\r\n");
  const at = lines.indexOf("DUTY ESTIMATES");
  if (at < 0) return [];
  const end = lines.indexOf("", at);
  return lines.slice(at + 1, end);
}

const HEADER =
  "For,Estimate Label,HTS Code,Origin,Entry Date,As Of,Customs Value (USD),Base Duty (USD),Additional Duties (USD),Fees (USD),Total (USD),Forwarder Quoted Duties (USD),Labels";

describe("no linked estimates: unchanged, byte for byte", () => {
  test("Expert", () => {
    const csv = buildForwarderReportCsv(baseData(), "expert");
    expect(hash(csv)).toBe(BEFORE.expertNone);
    expect(csv).not.toContain("DUTY ESTIMATES");
  });

  test("Client", () => {
    expect(hash(buildForwarderReportCsv(baseData(), "client"))).toBe(BEFORE.clientNone);
  });

  test("an empty list is the same as none", () => {
    expect(hash(buildForwarderReportCsv({ ...baseData(), dutyEstimates: new Map(), dutyEstimateList: [] }, "expert"))).toBe(BEFORE.expertNone);
  });
});

describe("the Expert CSV's DUTY ESTIMATES section", () => {
  test("one estimate, the project's own (the regression's case): every stored value, incomplete", () => {
    const csv = buildForwarderReportCsv(withEstimates([storedEstimate()]), "expert");
    expect(section(csv)).toEqual([
      HEADER,
      'Project,ZZQA linked est,6109.10.00.12,China,"Oct 23, 2026","Oct 23, 2026","$39,999.99","$6,599.99","$1,000.00",$291.72,"$7,891.71",,' +
        "Incomplete estimate; EXCLUDES 1 additional duty program that may apply; Pending expert review: Section 301 (forced labour); Estimate — verify with your customs broker.",
    ]);
    // A project estimate adds no quote-table columns (no quote has one).
    expect(csv).not.toContain("Duty Estimate (USD)");
    expect(csv).toContain("Duty estimates are informational");
  });

  test("two estimates: the project's own first, then the quote's, with what the forwarder quoted", () => {
    const csv = buildForwarderReportCsv(withEstimates([quoteEstimate(), storedEstimate()]), "expert");
    const rows = section(csv);
    expect(rows).toHaveLength(3);
    expect(rows[1].startsWith("Project,ZZQA linked est,")).toBe(true);
    expect(rows[2]).toBe(
      'Acme Freight · Sea FCL,Acme quote check,6402.99.31.10,Vietnam,"Nov 8, 2026","Oct 23, 2026","$10,000.00",$600.00,"$1,250.00",$47.14,"$1,897.14","$2,500.00",' +
        '"Duty data last reviewed Oct 2, 2026; Estimate — verify with your customs broker."',
    );
    // The quote table keeps its own duty columns.
    expect(csv).toContain("Forwarder Quoted Duties (USD),Duty Estimate (USD),Duty Estimate As Of,Duty Estimate Entry Date,Duty Estimate Labels");
  });

  test("only the latest per quote and for the project, as the card shows", () => {
    const older = storedEstimate({ id: "e-old", created_at: "2026-10-01T09:00:00Z", label: "Old project estimate" });
    const csv = buildForwarderReportCsv(withEstimates([older, storedEstimate()]), "expert");
    expect(section(csv)).toHaveLength(2);
    expect(csv).not.toContain("Old project estimate");
  });

  test("read as stored, never recalculated: parts that don't add up to the total are shown as saved", () => {
    const csv = buildForwarderReportCsv(withEstimates([storedEstimate({ base_duty_usd: "1.00", additional_duties_usd: "2.00", fees_usd: "3.00", total_usd: "99.00" })]), "expert");
    expect(section(csv)[1]).toContain(",$1.00,$2.00,$3.00,$99.00,,");
  });

  test("a complete estimate isn't labelled incomplete", () => {
    const csv = buildForwarderReportCsv(withEstimates([quoteEstimate()]), "expert");
    const labels = section(csv)[1];
    expect(labels).not.toContain("Incomplete estimate");
    expect(labels).not.toContain("EXCLUDES");
  });

  test.each(["=cmd|' /C calc'!A0", "+1+1", "-2+3", "@SUM(A1)"])("a hostile label (%s) goes through the formula guard", (label) => {
    const csv = buildForwarderReportCsv(withEstimates([storedEstimate({ label })]), "expert");
    const row = section(csv)[1];
    expect(row.startsWith(`Project,${escapeCsvField(label)},`)).toBe(true);
    expect(escapeCsvField(label).replace(/^"/, "").startsWith("'")).toBe(true);
  });
});

describe("the client CSV is unchanged with linked estimates", () => {
  test("byte for byte", () => {
    const csv = buildForwarderReportCsv(withEstimates([storedEstimate(), quoteEstimate()]), "client");
    expect(hash(csv)).toBe(BEFORE.clientWith);
    expect(csv).not.toContain("DUTY ESTIMATES");
  });
});

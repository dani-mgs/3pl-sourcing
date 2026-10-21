import { formatRateDate, timestampDateUtc } from "@/lib/fx/rate-provenance";
import { usd } from "@/lib/tariff/amount-text";
import { countryName } from "@/lib/tariff/countries";
import { parseDecimal } from "@/lib/tariff/rational";
import { toComparisonView, type ComparisonView } from "./comparison-view";
import { CHARACTERS_NOTE, pdfText } from "./pdf-text";
import { toResultViews, type ResultView } from "./result-view";
import type { ViewResult } from "./view-result";
import type { Workspace } from "./workspace-schema";

// A locked version as the blocks of its PDF: built only from the restored
// snapshot, through the same view functions as the screen, so every sentence
// reads as it does there. Every string is already safe for the PDF's font
// (pdf-text.ts). The renderer (render-version-pdf.ts) only draws. Pure.

export type ReportColumn = { header: string; width: number; align?: "left" | "right" };
export type ReportBlock =
  | { kind: "heading"; text: string; level: 1 | 2 | 3; newPage?: boolean }
  | { kind: "paragraph"; text: string; tone?: "normal" | "muted" | "strong" }
  | { kind: "pairs"; pairs: [string, string][] }
  | { kind: "list"; items: string[] }
  | { kind: "table"; columns: ReportColumn[]; rows: string[][] };

export type VersionMeta = {
  versionNo: number;
  // created_at as stored (ISO): the PDF's creation date, so output is repeatable.
  lockedAt: string;
  lockedOn: string;
  byName: string;
  workspaceName: string;
  entryDate: string;
  release: string;
  asOf: string;
  incomplete: boolean;
};

export type VersionReport = {
  title: string;
  headerLines: string[];
  // "Incomplete estimate: …" with its reasons, or null.
  banner: { title: string; lines: string[] } | null;
  // CHARACTERS_NOTE when a typed character couldn't be drawn.
  characterNote: string | null;
  blocks: ReportBlock[];
  // "<workspace> · vN"; the renderer adds "Page X of Y".
  footerLabel: string;
  disclaimer: string;
  creationDate: Date;
  documentTitle: string;
};

export const INCOMPLETE_TITLE = "Incomplete estimate: some duties or fees are not final";

// What the version page, the PDF and the CSV say about a stored version.
export function describeVersion(
  v: {
    version_no: number;
    created_at: string;
    as_of_date: string;
    workspace_name: string;
    entry_date: string;
    hts_release_name: string;
    hts_release_title: string | null;
    incomplete: boolean;
  },
  byName: string,
): VersionMeta & { lockedDate: string } {
  const lockedDate = timestampDateUtc(v.created_at);
  return {
    versionNo: v.version_no,
    lockedAt: v.created_at,
    lockedOn: formatRateDate(lockedDate),
    lockedDate,
    byName,
    workspaceName: v.workspace_name,
    entryDate: formatRateDate(v.entry_date),
    release: v.hts_release_title ? `${v.hts_release_title} (${v.hts_release_name})` : v.hts_release_name,
    asOf: formatRateDate(v.as_of_date),
    incomplete: v.incomplete,
  };
}

const FREIGHT_BASIS: Record<string, string> = { chargeable_weight: "Chargeable weight", value: "Value (FOB)", units: "Units" };
const MODE: Record<string, string> = { Sea: "Sea (ocean)", Air: "Air", Road: "Road" };
const dollars = (text: string | null) => (text ? usd(parseDecimal(text)) : "Not entered");

export function buildVersionReport(meta: VersionMeta, restored: { workspace: Workspace; result: ViewResult }): VersionReport {
  const t = pdfText();
  const { workspace, result } = restored;
  const views = toResultViews(result, workspace);
  const comparison = toComparisonView(result, workspace);
  const name = t.user(meta.workspaceName);
  const multi = workspace.scenarios.length > 1;
  const blocks: ReportBlock[] = [];

  // ---- The comparison, on page 1 ----
  if (multi) blocks.push(...comparisonBlocks(comparison, t));

  // ---- Each origin, on its own page when there are several ----
  const codes = new Map(workspace.skuLines.map((l) => [l.id, l]));
  workspace.scenarios.forEach((s, index) => {
    const view = views[s.id];
    blocks.push({
      kind: "heading",
      level: 1,
      text: `${t.user(s.label)}${s.isBaseline && multi ? t.own(" (baseline)") : ""}`,
      newPage: multi && (index > 0 || comparison.state !== "hidden"),
    });
    const fees = view?.state === "complete" ? view.feeNotes : [];
    blocks.push({ kind: "heading", level: 2, text: t.own("Inputs") });
    blocks.push({
      kind: "pairs",
      pairs: [
        [t.own("Country of origin"), t.own(countryName(s.originCountry))],
        [t.own("Supplier"), s.supplierName ? t.user(s.supplierName) : t.own("Not entered")],
        [t.own("Incoterm"), t.own(s.incoterm)],
        [t.own("Shipment mode"), t.own(MODE[s.shipmentMode] ?? s.shipmentMode)],
        [t.own("Entry type used"), t.own(fees[0] ?? (s.entryType === "formal" ? "Formal" : "Automatic"))],
        [t.own("Freight total"), t.own(dollars(s.freightTotalUsd))],
        [t.own("Freight split"), t.own(FREIGHT_BASIS[s.freightBasis] ?? s.freightBasis)],
        [t.own("Volumetric divisor"), t.own(s.volumetricDivisor ?? "Default for the mode")],
      ],
    });

    if (!view || view.state !== "complete") {
      blocks.push({ kind: "paragraph", text: t.own("This origin has no result in the stored version."), tone: "muted" });
      return;
    }
    blocks.push(...originBlocks(view, s, codes, t));
  });

  // ---- The header and banner (after the blocks, so every typed string is checked) ----
  const banner = meta.incomplete ? incompleteBanner(workspace, views, t) : null;
  const headerLines = [
    `Locked version v${meta.versionNo}, locked on ${meta.lockedOn} by ${t.user(meta.byName)}`,
    `Entry date ${meta.entryDate} · HTS release ${t.user(meta.release)} · Duty data as of ${meta.asOf}`,
  ].map((l) => t.own(l));

  return {
    title: t.own("Landed cost estimate"),
    headerLines: [name, ...headerLines],
    banner,
    characterNote: t.replaced() ? CHARACTERS_NOTE : null,
    blocks,
    footerLabel: `${name} · v${meta.versionNo}`,
    disclaimer: t.own(
      `Estimate for planning only, based on duty data as of ${meta.asOf}. Rates and fees can change. Not customs or legal advice.`,
    ),
    creationDate: new Date(meta.lockedAt),
    documentTitle: `Landed cost estimate - ${name} v${meta.versionNo}`,
  };
}

function incompleteBanner(workspace: Workspace, views: Record<string, ResultView>, t: ReturnType<typeof pdfText>) {
  const lines: string[] = [];
  for (const s of workspace.scenarios) {
    const view = views[s.id];
    if (view?.state !== "complete" || !view.incomplete) continue;
    const reasons = view.warnings.length > 0 ? view.warnings : ["duties or fees not final"];
    for (const r of reasons) lines.push(t.user(`${s.label}: ${r}`));
  }
  return { title: t.own(INCOMPLETE_TITLE), lines };
}

function comparisonBlocks(view: ComparisonView, t: ReturnType<typeof pdfText>): ReportBlock[] {
  const out: ReportBlock[] = [{ kind: "heading", level: 1, text: t.own("Compare origins") }];
  if (view.state === "hidden") return [];
  if (view.state !== "ready") {
    out.push({ kind: "paragraph", text: t.user(view.note) });
    if ("excluded" in view && view.excluded.length > 0) {
      out.push({ kind: "list", items: view.excluded.map((e) => t.user(`${e.label}: ${e.reason}`)) });
    }
    return out;
  }
  if (view.verdict) {
    out.push({ kind: "paragraph", text: t.user(view.verdict.text), tone: "strong" });
    out.push({ kind: "paragraph", text: t.user(view.verdict.perShipment) });
  } else if (view.noRankingNote) {
    out.push({ kind: "paragraph", text: t.own(view.noRankingNote) });
  }
  if (view.caution) out.push({ kind: "paragraph", text: t.user(view.caution), tone: "strong" });
  if (view.modes) out.push({ kind: "paragraph", text: t.user(`Different shipment modes: ${view.modes}`) });

  if (view.ranking.length > 0) {
    out.push({ kind: "heading", level: 2, text: t.own("Ranking") });
    out.push({
      kind: "table",
      columns: [
        { header: "#", width: 0.05 },
        { header: "Origin", width: 0.22 },
        { header: "Position", width: 0.18 },
        { header: "Per unit", width: 0.1, align: "right" },
        { header: "Shipment", width: 0.13, align: "right" },
        { header: "Against the baseline", width: 0.32 },
      ],
      rows: view.ranking.map((r) => [
        String(r.rank),
        t.user(`${r.label}${r.isBaseline ? " (baseline)" : ""}`),
        t.own(r.position ?? ""),
        r.perUnit,
        r.total,
        t.own(r.vsBaseline),
      ]),
    });
  }

  out.push({ kind: "heading", level: 2, text: t.own("Per SKU: landed cost per unit") });
  const cols = view.skuTable.columns;
  const width = 0.62 / Math.max(cols.length, 1);
  out.push({
    kind: "table",
    columns: [
      { header: "SKU", width: 0.16 },
      ...cols.map((c) => ({ header: t.user(`${c.label}${c.note ? ` (${c.note.toLowerCase()})` : ""}`), width, align: "right" as const })),
      { header: "Lowest", width: 0.22 },
    ],
    rows: view.skuTable.rows.map((row) => {
      const marked = row.cells.flatMap((cell, i) => (cell.mark ? [cols[i].label] : []));
      const tie = row.cells.some((c) => c.mark === "Lowest (tie)");
      return [
        t.user(row.skuCode),
        ...row.cells.map((c) => c.text),
        marked.length === 0 ? "" : t.user(tie ? `Lowest (tie): ${marked.join(", ")}` : marked[0]),
      ];
    }),
  });

  if (view.drivers.length > 0) {
    out.push({ kind: "heading", level: 2, text: t.own("What drives the difference, against the baseline") });
    for (const d of view.drivers) {
      out.push({ kind: "heading", level: 3, text: t.user(d.label) });
      out.push({ kind: "paragraph", text: t.own(d.summary) });
      out.push({ kind: "list", items: [...d.lines.map((l) => t.own(l)), ...(d.roundedNote ? [t.own("Per-unit amounts are rounded.")] : [])] });
    }
  }
  if (view.notComparable.length > 0) {
    out.push({ kind: "heading", level: 2, text: t.own("Not comparable with the baseline") });
    out.push({
      kind: "list",
      items: view.notComparable.map((n) => t.user(`${n.label}: ${n.reasons.join(" ")} Its own totals are shown; it isn't ranked.`)),
    });
  }
  if (view.excluded.length > 0) {
    out.push({ kind: "heading", level: 2, text: t.own("Left out of the comparison") });
    out.push({ kind: "list", items: view.excluded.map((e) => t.user(`${e.label}: ${e.reason}`)) });
  }
  return out;
}

function originBlocks(
  view: Extract<ResultView, { state: "complete" }>,
  s: Workspace["scenarios"][number],
  lines: Map<string, Workspace["skuLines"][number]>,
  t: ReturnType<typeof pdfText>,
): ReportBlock[] {
  const out: ReportBlock[] = [];
  const items = new Map(s.items.map((i) => [i.skuLineId, i]));

  out.push({ kind: "heading", level: 2, text: t.own(`Landed cost: ${view.perUnit} per unit, ${view.total} for ${view.units}`) });
  out.push({
    kind: "table",
    columns: [
      { header: "Component", width: 0.4 },
      { header: "Amount", width: 0.22, align: "right" },
      { header: "Per unit", width: 0.2, align: "right" },
      { header: "Share", width: 0.18, align: "right" },
    ],
    rows: [
      ...view.breakdown.map((b) => [t.own(b.label), b.amount, b.perUnit, b.share]),
      [t.own("Total"), view.total, view.perUnit, "100.0%"],
    ],
  });
  if (view.percentagesRounded) out.push({ kind: "paragraph", text: t.own("Percentages are rounded."), tone: "muted" });
  if (view.incomplete) out.push({ kind: "paragraph", text: t.own("Duties or fees for this origin are not final."), tone: "strong" });

  out.push({ kind: "heading", level: 2, text: t.own("Per SKU") });
  out.push({
    kind: "table",
    columns: [
      { header: "SKU", width: 0.13 },
      { header: "Description", width: 0.27 },
      { header: "HTS", width: 0.14 },
      { header: "Qty", width: 0.09, align: "right" },
      { header: "FOB/unit", width: 0.11, align: "right" },
      { header: "Landed/unit", width: 0.13, align: "right" },
      { header: "Duties", width: 0.13, align: "right" },
    ],
    rows: view.skus.map((k) => {
      const line = lines.get(k.skuLineId);
      const fob = items.get(k.skuLineId)?.fobUnitPriceUsd;
      return [
        t.user(k.skuCode),
        t.user(line?.description ?? ""),
        k.htsCode,
        line ? Number(line.quantity).toLocaleString("en-US") : "",
        fob ? `$${fob}` : "",
        k.perUnit ?? "",
        k.duties ?? "",
      ];
    }),
  });

  out.push({ kind: "heading", level: 2, text: t.own("Duty layers") });
  for (const k of view.skus) {
    out.push({ kind: "heading", level: 3, text: t.user(`${k.skuCode} (HTS ${k.htsCode})${k.dutyRate ? `: effective duty rate ${k.dutyRate}` : ""}`) });
    out.push({
      kind: "table",
      columns: [
        { header: "Layer", width: 0.3 },
        { header: "Rate", width: 0.16 },
        { header: "Amount", width: 0.13, align: "right" },
        { header: "Source", width: 0.27 },
        { header: "Checked on", width: 0.14 },
      ],
      rows: k.layers.map((l) => [
        t.own(`${l.label}${l.heading ? ` (${l.heading})` : ""}${l.detail ? `: ${l.detail}` : ""}`),
        t.own(l.rate),
        l.amount,
        t.own(l.sourceLabel),
        l.checkedOn ?? "",
      ]),
    });
    // Already worded: "Duty rates last verified: …" or that there are no reviewed duties.
    if (k.lastVerified) out.push({ kind: "paragraph", text: t.own(k.lastVerified), tone: "muted" });
    for (const note of k.layers.flatMap((l) => l.notes)) out.push({ kind: "paragraph", text: t.own(note), tone: "muted" });
  }

  out.push({ kind: "heading", level: 2, text: t.own("Fees") });
  out.push({ kind: "list", items: view.feeNotes.map((n) => t.own(n)) });
  if (view.warnings.length > 0) out.push({ kind: "list", items: view.warnings.map((w) => t.own(w)) });

  out.push({ kind: "heading", level: 2, text: t.own("Other costs") });
  out.push(
    s.otherCosts.length === 0
      ? { kind: "paragraph", text: t.own("None."), tone: "muted" }
      : { kind: "list", items: s.otherCosts.map((c) => `${t.user(c.label)}: ${t.own(dollars(c.amountUsd))}`) },
  );
  return out;
}

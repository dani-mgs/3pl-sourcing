import { buildCsv, buildMultiSectionCsv, escapeCsvField, sanitizeFilename } from "@/lib/forwarder/export-csv";
import { pctText } from "@/lib/tariff/amount-text";
import { countryName } from "@/lib/tariff/countries";
import { NO_REVIEWED_DUTIES_TEXT } from "@/lib/tariff/effective-rate";
import { formatHtsCode } from "@/lib/tariff/hts-code";
import { parseDecimal } from "@/lib/tariff/rational";
import { toComparisonView } from "./comparison-view";
import { COMPONENT_KEYS, type ComponentKey } from "./components";
import type { DutyLine } from "./manual-rates";
import { parseCents, perUnit } from "./money";
import { INCLUDES_MANUAL_RATE, missingItems, shares } from "./result-view";
import type { Scenario, Workspace } from "./workspace-schema";
import type { ViewOutcome, ViewResult } from "./view-result";

// A workspace as CSV, built on the server from its last save and a fresh
// calculation (nothing from the browser). Sections stack with
// buildMultiSectionCsv; every cell and title goes through escapeCsvField
// (formula-injection safe). Money is a plain number with 2 decimals and
// "(USD)" in the heading; a difference is an amount plus a direction in
// words, never a sign. Pure.

export const DRAFT_NOTE = "DRAFT: not a locked estimate. Figures change when inputs or duty data change.";

type Cell = string | number | null | undefined;
type Section = { title: string; csv: string };
type Complete = Extract<ViewOutcome, { state: "complete" }>;

const B0 = BigInt(0);
const abs = (n: bigint) => (n < B0 ? -n : n);

// 173473 → "1734.73". Never negative here: differences are written with a direction.
export function plainCents(cents: bigint): string {
  const a = abs(cents);
  const whole = a / BigInt(100);
  const rest = (a % BigInt(100)).toString().padStart(2, "0");
  return `${cents < B0 ? "-" : ""}${whole}.${rest}`;
}
// An entered USD amount ("854", "95.5") with 2 decimals; as entered if it can't be read.
const plainAmount = (text: string | null) => {
  if (text == null) return "";
  const cents = parseCents(text);
  return cents == null ? text : plainCents(cents);
};
const plainUsd = (n: number) => n.toFixed(2);

const section = (title: string, headers: string[], rows: Cell[][]): Section => ({ title: escapeCsvField(title), csv: buildCsv(headers, rows) });
const lines = (title: string, values: string[]): Section => ({
  title: escapeCsvField(title),
  csv: values.map((v) => escapeCsvField(v)).join("\r\n") + "\r\n",
});

const MODE = { Sea: "Sea (ocean)", Air: "Air", Road: "Road" } as const;
const ENTRY = { auto: "Automatic", formal: "Formal" } as const;
const FREIGHT_BASIS = { chargeable_weight: "Chargeable weight", value: "Value (FOB)", units: "Units" } as const;
const SKU_STATUS = { ok: "Complete", inputs_missing: "Inputs missing", duty_error: "Duty error", manual_rate_conflict: "Manual rate to fix" } as const;
const COMPONENT_NOUNS: Record<ComponentKey, string> = {
  fob: "Product (FOB)",
  freight: "Freight",
  duties: "Duties",
  fees: "Fees (MPF and HMF)",
  other: "Other costs",
};

// A locked version's CSV says so in place of the DRAFT line.
export type LockedCsv = { versionNo: number; lockedOn: string; byName: string; release: string; asOf: string };

export const lockedNote = (l: LockedCsv) =>
  `LOCKED VERSION v${l.versionNo}, locked on ${l.lockedOn} by ${l.byName}. These figures are fixed.`;

function workspaceSection(workspace: Workspace, calculatedOn: string, locked: LockedCsv | null): Section {
  return section("Landed Cost workspace", ["Field", "Value"], [
    ["Workspace", workspace.name],
    ["Entry date", workspace.entryDate],
    ["Calculated on", calculatedOn],
    ["Status", locked ? lockedNote(locked) : DRAFT_NOTE],
    ...(locked ? [["HTS release", locked.release], ["Duty data as of", locked.asOf]] : []),
  ]);
}

function skuSection(workspace: Workspace): Section {
  return section(
    "SKUs (shared by every origin)",
    ["SKU", "Description", "HTS code", "Quantity (pcs)", "Duty quantity", "Duty quantity unit"],
    workspace.skuLines.map((l) => [l.skuCode, l.description, formatHtsCode(l.htsCode), l.quantity, l.dutyQuantity?.value, l.dutyQuantity?.unit]),
  );
}

function inputSections(workspace: Workspace, s: Scenario): Section[] {
  const items = new Map(s.items.map((i) => [i.skuLineId, i]));
  return [
    section(`${s.label}: inputs`, ["Field", "Value"], [
      ["Label", s.label],
      ["Country", countryName(s.originCountry)],
      ["Supplier", s.supplierName],
      ["Baseline", s.isBaseline ? "Yes" : "No"],
      ["Incoterm", s.incoterm],
      ["Shipment mode", MODE[s.shipmentMode]],
      ["Entry type", ENTRY[s.entryType]],
      ["Freight total (USD)", plainAmount(s.freightTotalUsd)],
      ["Freight split", FREIGHT_BASIS[s.freightBasis]],
      ["Volumetric divisor", s.volumetricDivisor ?? "Default for the mode"],
      ...s.otherCosts.map((c): Cell[] => [`Other cost: ${c.label} (USD)`, plainAmount(c.amountUsd)]),
    ]),
    section(
      `${s.label}: inputs per SKU`,
      ["SKU", "FOB per unit (USD)", "Pcs per carton", "L (cm)", "W (cm)", "H (cm)", "Carton kg"],
      workspace.skuLines.map((l) => {
        const i = items.get(l.id);
        return [l.skuCode, i?.fobUnitPriceUsd, i?.pcsPerCarton, i?.cartonLengthCm, i?.cartonWidthCm, i?.cartonHeightCm, i?.cartonGrossKg];
      }),
    ),
  ];
}

// Whether any SKU of any origin has a manual layer: only then do the
// manual-rate columns appear, so every other export stays as it was.
export function hasManualRates(result: ViewResult): boolean {
  return result.state === "ready" && result.scenarios.some((o) => o.skus.some((s) => s.status !== "duty_error" && (s.duty?.lines ?? []).some((l) => l.manual)));
}

const MANUAL_COLUMNS = ["Manual", "Manual value", "App rate", "Reason", "Set by", "Set on"];

// Our own cells never start with = + - @, so the formula guard never has to
// prefix them: the app rate drops its "+" ("+25%" → "25%"); the value is 0 or
// more ("0%", "Fixed 12.34") and the date is ISO. Reason and Set by are typed
// text and stay with the guard.
const plainRateText = (text: string) => text.replace(/^\+/, "");

function manualCells(l: DutyLine): Cell[] {
  const m = l.manual;
  if (!m) return ["No", "", "", "", "", ""];
  const value = m.ratePercent != null ? pctText(parseDecimal(m.ratePercent)) : `Fixed ${m.amountUsd}`;
  const appRate = m.engineRateText != null ? `${plainRateText(m.engineRateText)}${m.engineAmountUsd != null ? ` (${m.engineAmountUsd})` : ""}` : "";
  return ["Yes", value, appRate, m.reason, m.setByName, m.setAt.slice(0, 10)];
}

function resultSections(workspace: Workspace, outcome: ViewOutcome, manual: boolean): Section[] {
  const label = outcome.label;
  const codes = new Map(workspace.skuLines.map((l) => [l.id, l]));
  const totals = outcome.state === "complete" ? new Map(outcome.totals.skus.map((t) => [t.skuId, t])) : null;

  const perSku = section(
    `${label}: results per SKU`,
    [
      "SKU",
      "HTS code",
      "Status",
      "Product (USD)",
      "Freight (USD)",
      "Duties (USD)",
      "MPF (USD)",
      "HMF (USD)",
      "Other costs (USD)",
      "Total (USD)",
      "Per unit (USD)",
      "Effective duty rate",
    ],
    outcome.skus.map((s) => {
      const line = codes.get(s.skuLineId);
      const t = totals?.get(s.skuLineId);
      const duty = s.status === "duty_error" ? null : s.duty;
      const money = (pick: (x: NonNullable<typeof t>) => bigint) => (t ? plainCents(pick(t)) : "");
      return [
        line?.skuCode,
        line ? formatHtsCode(line.htsCode) : "",
        s.status === "duty_error"
          ? `${SKU_STATUS.duty_error}: ${s.message}`
          : s.status === "manual_rate_conflict"
            ? `${SKU_STATUS.manual_rate_conflict}: ${s.conflicts.map((c) => c.message).join(" ")}`
            : SKU_STATUS[s.status],
        money((x) => x.productCents),
        money((x) => x.freightCents),
        t ? plainCents(t.dutiesCents) : duty ? plainCents(duty.dutiesCents) : "",
        money((x) => x.mpfCents),
        money((x) => x.hmfCents),
        money((x) => x.otherCents),
        money((x) => x.totalCents),
        money((x) => x.perUnitCents),
        duty?.effectiveDutyRate,
      ];
    }),
  );

  const layers = section(
    `${label}: duty layers`,
    ["SKU", "Layer", "Heading", "Rate", "Amount (USD)", "Source", "Source URL", "Source checked on", "Last verified", ...(manual ? MANUAL_COLUMNS : [])],
    outcome.skus.flatMap((s) => {
      if (s.status === "duty_error" || !s.duty) return [];
      const code = codes.get(s.skuLineId)?.skuCode;
      const verified = s.duty.oldestReview?.text ?? NO_REVIEWED_DUTIES_TEXT;
      return s.duty.lines.map((l): Cell[] => [
        code, l.label, l.heading, l.rateText, plainUsd(l.amountUsd), l.sourceLabel, l.sourceUrl, l.sourceCheckedOn, verified,
        ...(manual ? manualCells(l) : []),
      ]);
    }),
  );

  if (outcome.state === "error") return [perSku, layers, lines(`${label}: totals`, [`Not calculated: ${outcome.message}`])];
  if (outcome.state === "incomplete") {
    const missing = missingItems(workspace, outcome).map((m) => m.label);
    return [perSku, layers, lines(`${label}: totals`, [`Incomplete: ${missing.join("; ")}`])];
  }

  const t = outcome.totals;
  const fees = t.entryFees;
  const entry =
    fees.entryTypeSource === "chosen"
      ? "Formal, as chosen for this origin"
      : fees.entryType === "informal"
        ? "Informal, chosen automatically: the entered value is within the informal limit"
        : "Formal, chosen automatically: the entered value is above the informal limit";
  const feeSection = section(`${label}: fees`, ["Fee", "Rate", "Amount (USD)", "Note"], [
    ["Entry type used", "", "", entry],
    ["MPF", fees.mpf.line.rateText, plainCents(fees.mpf.cents), fees.mpf.line.detail ?? "One MPF for the whole entry, split across SKUs by entered value"],
    fees.hmf
      ? ["HMF", fees.hmf.line.rateText, plainCents(fees.hmf.cents), "Ocean shipments only; split across SKUs by entered value"]
      : ["HMF", "", "0.00", "Not charged (ocean shipments only)"],
  ]);

  const sum = (pick: (s: (typeof t.skus)[number]) => bigint) => t.skus.reduce((acc, s) => acc + pick(s), B0);
  const parts: [string, bigint][] = [
    ["Product (FOB)", sum((s) => s.productCents)],
    ["Freight", sum((s) => s.freightCents)],
    ["Duties", sum((s) => s.dutiesCents)],
    ["MPF", sum((s) => s.mpfCents)],
    ["HMF", sum((s) => s.hmfCents)],
    ["Other costs", sum((s) => s.otherCents)],
  ];
  const pct = shares(parts.map((p) => p[1]));
  const totalsSection = section(`${label}: totals`, ["Component", "Amount (USD)", "Per unit (USD)", "Share"], [
    ...parts.map(([name, cents], i): Cell[] => [name, plainCents(cents), plainCents(perUnit(cents, t.units).cents), pct.texts[i]]),
    ["Total", plainCents(t.totalCents), plainCents(t.perUnitCents), ""],
    ["Units (pcs)", t.units.toString(), "", ""],
    ["Status", [t.status.incomplete ? "Complete; duties or fees not final" : "Complete", ...(t.status.includesManualRate ? [INCLUDES_MANUAL_RATE] : [])].join("; "), "", ""],
  ]);
  return [perSku, layers, feeSection, totalsSection];
}

function comparisonSections(workspace: Workspace, result: Extract<ViewResult, { state: "ready" }>): Section[] {
  const view = toComparisonView(result, workspace);
  if (view.state === "hidden") return [];
  if (view.state !== "ready") {
    return [lines("Comparison", [view.note, ...("excluded" in view ? view.excluded.map((e) => `Left out: ${e.label}: ${e.reason}`) : [])])];
  }
  const complete = new Map(
    result.scenarios.filter((o): o is Complete => o.state === "complete").map((o) => [o.scenarioId, o]),
  );
  const units = [...complete.values()].find((o) => o.isBaseline)?.totals.units ?? BigInt(1);
  const sections: Section[] = [
    lines("Comparison: verdict", [
      ...(view.verdict ? [view.verdict.text, view.verdict.perShipment] : [view.noRankingNote ?? ""]),
      ...(view.modes ? [`Different shipment modes: ${view.modes}`] : []),
      ...(view.caution ? [view.caution] : []),
    ]),
  ];
  if (view.ranking.length > 0) {
    sections.push(
      section(
        "Comparison: ranking",
        ["Rank", "Origin", "Baseline", "Position", "Per unit (USD)", "Shipment total (USD)", "Against the baseline"],
        view.ranking.map((r) => {
          const o = complete.get(r.scenarioId)!;
          return [r.rank, r.label, r.isBaseline ? "Yes" : "No", r.position ?? "", plainCents(o.totals.perUnitCents), plainCents(o.totals.totalCents), r.vsBaseline];
        }),
      ),
    );
  }
  const cols = view.skuTable.columns;
  sections.push(
    section(
      "Comparison: per-SKU landed cost per unit",
      ["SKU", ...cols.map((c) => `${c.label}${c.note ? ` (${c.note.toLowerCase()})` : ""} per unit (USD)`), "Lowest"],
      view.skuTable.rows.map((row, i) => {
        const line = workspace.skuLines[i];
        const values = cols.map((c) => {
          const t = complete.get(c.scenarioId)?.totals.skus.find((s) => s.skuId === line.id);
          return t ? plainCents(t.perUnitCents) : "";
        });
        const lowest = row.cells.flatMap((cell, j) => (cell.mark ? [cols[j].label] : []));
        return [row.skuCode, ...values, lowest.length > 1 ? `Tie: ${lowest.join(", ")}` : (lowest[0] ?? "")];
      }),
    ),
  );
  const drivers = result.comparison?.results ?? [];
  if (view.drivers.length > 0) {
    sections.push(
      section(
        "Comparison: drivers against the baseline",
        ["Origin", "Component", "Direction", "Per shipment (USD)", "Per unit (USD)", "In words"],
        view.drivers.flatMap((block) => {
          const r = drivers.find((d) => d.id === block.scenarioId);
          const parts = r && Array.isArray(r.drivers) ? r.drivers : [];
          return COMPONENT_KEYS.map((key, k): Cell[] => {
            // Baseline minus origin: positive means this origin costs less.
            const diff = parts.find((d) => d.key === key)?.differenceCents ?? B0;
            const direction = diff === B0 ? "Same" : diff > B0 ? "Less" : "More";
            return [block.label, COMPONENT_NOUNS[key], direction, plainCents(abs(diff)), plainCents(perUnit(abs(diff), units).cents), block.lines[k]];
          });
        }),
      ),
    );
  }
  if (view.notComparable.length > 0) {
    sections.push(
      section(
        "Comparison: not comparable with the baseline",
        ["Origin", "Reasons"],
        view.notComparable.map((n) => [n.label, n.reasons.join(" ")]),
      ),
    );
  }
  if (view.excluded.length > 0) {
    sections.push(section("Comparison: left out", ["Origin", "Reason"], view.excluded.map((e) => [e.label, e.reason])));
  }
  return sections;
}

// A draft (recalculated from the last save), or a locked version (restored
// from its snapshot, never recalculated) when `locked` is given.
export function buildWorkspaceCsv(workspace: Workspace, result: ViewResult, locked: LockedCsv | null = null): string {
  const sections: Section[] = [workspaceSection(workspace, result.calculatedOn, locked), skuSection(workspace)];
  const manual = hasManualRates(result);
  const notCalculated = result.state === "ready" ? null : result.state === "no_sku_lines" ? "Add at least one SKU." : result.message;
  for (const s of workspace.scenarios) {
    sections.push(...inputSections(workspace, s));
    if (result.state !== "ready") {
      sections.push(lines(`${s.label}: totals`, [`Not calculated: ${notCalculated}`]));
      continue;
    }
    const outcome = result.scenarios.find((o) => o.scenarioId === s.id);
    if (outcome) sections.push(...resultSections(workspace, outcome, manual));
  }
  if (workspace.scenarios.length > 1) {
    sections.push(
      ...(result.state === "ready" ? comparisonSections(workspace, result) : [lines("Comparison", [`Not calculated: ${notCalculated}`])]),
    );
  }
  return buildMultiSectionCsv(sections);
}

// landed-cost-<workspace-name>-v<N>-<locked date>.pdf / .csv
export function versionFilename(name: string, versionNo: number, lockedDate: string, extension: "pdf" | "csv"): string {
  return `landed-cost-${sanitizeFilename(name)}-v${versionNo}-${lockedDate}.${extension}`;
}

// landed-cost-<workspace-name>-<date>-draft.csv
export function workspaceCsvFilename(name: string, calculatedOn: string): string {
  return `landed-cost-${sanitizeFilename(name)}-${calculatedOn}-draft.csv`;
}

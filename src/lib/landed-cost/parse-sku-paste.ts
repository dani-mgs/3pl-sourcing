import { MAX_SKU_LINES } from "./parse-draft";

// Rows copied from Excel and pasted as text: tab-separated cells, rows ended
// by CRLF, LF or CR, and a cell holding a tab, newline or quote wrapped in
// quotes with its quotes doubled. With a header row, columns are mapped by
// heading; without one, by the fixed order below. Only inputs are imported:
// every calculated column (totals, rates, fees, freight, landed cost) is
// listed as ignored with the reason, never read. Pure; the values are
// checked against the draft in sku-paste.ts.

export const PASTE_FIELDS = [
  "skuCode",
  "description",
  "htsCode",
  "quantity",
  "fobUnitPriceUsd",
  "pcsPerCarton",
  "cartonLengthCm",
  "cartonWidthCm",
  "cartonHeightCm",
  "cartonGrossKg",
] as const;
export type PasteField = (typeof PASTE_FIELDS)[number];

export const PASTE_FIELD_LABELS: Record<PasteField, string> = {
  skuCode: "SKU",
  description: "Description",
  htsCode: "HTS code",
  quantity: "Quantity",
  fobUnitPriceUsd: "FOB per unit (USD)",
  pcsPerCarton: "Pcs per carton",
  cartonLengthCm: "L (cm)",
  cartonWidthCm: "W (cm)",
  cartonHeightCm: "H (cm)",
  cartonGrossKg: "Carton kg",
};

// Without a header row, the columns are read in this order.
export const FIXED_ORDER: readonly PasteField[] = PASTE_FIELDS;

export const MAX_PASTE_CHARS = 500_000;

const dims = (letter: string, word: string, field: PasteField): [string, PasteField][] =>
  [`${letter} (cm)`, `${letter} cm`, `${word} (cm)`, `${word} cm`, `carton ${word} (cm)`].map((h) => [h, field]);

// Heading (normalised) to field. A lower priority number wins when two
// columns give the same field; "Unit Cost" only when no FOB column is there.
const ALIASES: [string, PasteField, number?][] = [
  ...(["sku", "sku code", "sku #", "item code"].map((h) => [h, "skuCode"]) as [string, PasteField][]),
  ...(["description", "product description", "item description", "product name"].map((h) => [h, "description"]) as [string, PasteField][]),
  ...(["hts", "hts code", "hts number", "htsus"].map((h) => [h, "htsCode"]) as [string, PasteField][]),
  ...(["quantity", "qty", "quantity (pcs)", "total quantity"].map((h) => [h, "quantity"]) as [string, PasteField][]),
  ...(
    ["fob unit cost (usd)", "fob unit cost", "fob per unit", "fob per unit (usd)", "fob price", "fob unit price", "fob price per unit (usd)"].map((h) => [
      h,
      "fobUnitPriceUsd",
    ]) as [string, PasteField][]
  ),
  ["unit cost", "fobUnitPriceUsd", 1],
  ...(
    ["box configuration (pcs/carton)", "pcs per carton", "pcs/carton", "pieces per carton", "units per carton"].map((h) => [h, "pcsPerCarton"]) as [
      string,
      PasteField,
    ][]
  ),
  ...dims("l", "length", "cartonLengthCm"),
  ...dims("w", "width", "cartonWidthCm"),
  ...dims("h", "height", "cartonHeightCm"),
  ...(
    ["total weight/master carton (kg)", "carton kg", "carton weight (kg)", "carton gross kg", "gross weight per carton (kg)"].map((h) => [
      h,
      "cartonGrossKg",
    ]) as [string, PasteField][]
  ),
];

export const IGNORE_REASONS = {
  rates: "Rates and fees come from the tariff engine.",
  freight: "Enter the freight total for the origin.",
  otherCosts: "Add these under Other costs.",
  calculated: "Calculated here.",
  cbm: "CBM can't be split into carton sizes. Paste L, W and H in cm.",
  elsewhere: "Calculated or entered elsewhere.",
  unknown: "Not recognised.",
} as const;

const unitNotStated = (example: string) => `Unit not stated. Name it "${example}".`;

// Headings known not to be imported, with why.
const IGNORED: [string, string][] = [
  ...[
    "ad valorem",
    "section 301",
    "reciprocal",
    "tariff",
    "tariff rate",
    "total tariff rate",
    "tariff cost",
    "duty",
    "duties",
    "mpf",
    "tariff rate (%)",
    "mpf rate",
    "mpf rate (%)",
    "mpf cost",
    "hmf",
    "hmf rate",
    "hmf rate (%)",
    "hmf cost",
    "landed cost",
    "total landed cost",
    "landed cost per unit",
  ].map((h): [string, string] => [h, IGNORE_REASONS.rates]),
  ...["freight", "freight per unit", "freight cost per unit", "total freight", "total freight cost", "freight/pc"].map((h): [string, string] => [h, IGNORE_REASONS.freight]),
  ["other costs", IGNORE_REASONS.otherCosts],
  ...["total unit cost", "total fob", "total cost", "cartons", "number of cartons", "total weight"].map((h): [string, string] => [
    h,
    IGNORE_REASONS.calculated,
  ]),
  ...["cbm", "total cbm", "volumetric weight/master carton (cbm)"].map((h): [string, string] => [h, IGNORE_REASONS.cbm]),
  ...["l", "length"].map((h): [string, string] => [h, unitNotStated("L (cm)")]),
  ...["w", "width"].map((h): [string, string] => [h, unitNotStated("W (cm)")]),
  ...["h", "height"].map((h): [string, string] => [h, unitNotStated("H (cm)")]),
  ...["weight", "carton weight", "gross weight"].map((h): [string, string] => [h, unitNotStated("Carton kg")]),
];

// Lowercase, all whitespace (newlines too) as one space, no spaces around
// "/", and an optional trailing "(USD)": "Total Weight / Master Carton (kg)"
// and "Unit Cost (USD)" match their aliases.
export const normalizeHeading = (heading: string) =>
  heading
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/ ?\/ ?/g, "/")
    .replace(/ ?\(usd\)$/, "");
// A heading as shown back: its whitespace collapsed.
const shown = (heading: string) => heading.replace(/\s+/g, " ").trim();

const ALIAS_MAP = new Map(ALIASES.map(([h, field, priority]) => [normalizeHeading(h), { field, priority: priority ?? 0 }]));
const IGNORED_MAP = new Map(IGNORED.map(([h, reason]) => [normalizeHeading(h), reason]));
// Under a merged "Tariff Rate (%)" heading, the experts' sheets have a second heading row.
const SUB_HEADINGS = new Set(["ad valorem", "section 301", "reciprocal"]);
export const SUB_HEADING_NOTE = "Skipped a second heading row (tariff sub-columns).";
// After the exact names: anything mentioning these is calculated or entered elsewhere.
const ELSEWHERE = /tariff|duty|rate|mpf|hmf|landed|freight/i;


export type IgnoredColumn = { heading: string; reason: string };
export type PastedRow = { rowNumber: number; values: Partial<Record<PasteField, string>> };
export type ParsedPaste =
  | {
      ok: true;
      hasHeader: boolean;
      columns: { heading: string; field: PasteField }[];
      ignored: IgnoredColumn[];
      // Rows skipped on purpose, e.g. a second heading row.
      notes: string[];
      rows: PastedRow[];
    }
  | { ok: false; error: string };

// Excel's clipboard text as rows of cells (quotes removed, "" read as ").
export function splitTsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let i = 0;
  const endCell = () => {
    row.push(cell);
    cell = "";
  };
  const endRow = () => {
    endCell();
    rows.push(row);
    row = [];
  };
  while (i < text.length) {
    const ch = text[i];
    if (ch === '"' && cell === "") {
      // A quoted cell: up to the quote that isn't doubled.
      i++;
      while (i < text.length) {
        if (text[i] === '"') {
          if (text[i + 1] === '"') {
            cell += '"';
            i += 2;
            continue;
          }
          i++;
          break;
        }
        cell += text[i++];
      }
      continue;
    }
    if (ch === "\t") endCell();
    else if (ch === "\r" || ch === "\n") {
      endRow();
      if (ch === "\r" && text[i + 1] === "\n") i++;
    } else cell += ch;
    i++;
  }
  if (cell !== "" || row.length > 0) endRow();
  // Trailing empty cells go.
  return rows.map((r) => {
    let end = r.length;
    while (end > 0 && r[end - 1].trim() === "") end--;
    return r.slice(0, end);
  });
}

// A one-letter cell (a size "L") doesn't make a row a header row.
function isKnownHeading(cell: string): boolean {
  const h = normalizeHeading(cell);
  return h.length > 1 && (ALIAS_MAP.has(h) || IGNORED_MAP.has(h));
}

// Each heading's field, or why it's ignored. Exact names first, then the
// CBM note, then the "calculated or entered elsewhere" words.
function mapHeadings(headings: string[]): { byIndex: (PasteField | null)[]; columns: { heading: string; field: PasteField }[]; ignored: IgnoredColumn[] } {
  const winner = new Map<PasteField, { index: number; priority: number }>();
  headings.forEach((heading, index) => {
    const alias = ALIAS_MAP.get(normalizeHeading(heading));
    if (!alias) return;
    const current = winner.get(alias.field);
    if (!current || alias.priority < current.priority) winner.set(alias.field, { index, priority: alias.priority });
  });
  const byIndex: (PasteField | null)[] = [];
  const columns: { heading: string; field: PasteField }[] = [];
  const ignored: IgnoredColumn[] = [];
  headings.forEach((heading, index) => {
    const name = normalizeHeading(heading);
    const alias = ALIAS_MAP.get(name);
    byIndex.push(null);
    if (name === "") return;
    if (alias) {
      const won = winner.get(alias.field)!;
      if (won.index === index) {
        byIndex[index] = alias.field;
        columns.push({ heading: shown(heading), field: alias.field });
      } else {
        ignored.push({ heading: shown(heading), reason: `Another column (${shown(headings[won.index])}) already gives ${PASTE_FIELD_LABELS[alias.field]}.` });
      }
      return;
    }
    const reason = IGNORED_MAP.get(name) ?? (name.includes("cbm") ? IGNORE_REASONS.cbm : ELSEWHERE.test(name) ? IGNORE_REASONS.elsewhere : IGNORE_REASONS.unknown);
    ignored.push({ heading: shown(heading), reason });
  });
  return { byIndex, columns, ignored };
}

export function parseSkuPaste(text: string): ParsedPaste {
  if (text.length > MAX_PASTE_CHARS) {
    return { ok: false, error: `This paste is too long. Paste at most ${MAX_SKU_LINES} rows at a time.` };
  }
  const all = splitTsv(text);
  const numbered = all.map((cells, i) => ({ rowNumber: i + 1, cells })).filter((r) => r.cells.some((c) => c.trim() !== ""));
  if (numbered.length === 0) return { ok: false, error: "Nothing to import. Copy the rows in Excel, then paste them here." };

  const hasHeader = numbered[0].cells.some(isKnownHeading);
  let byIndex: (PasteField | null)[];
  let columns: { heading: string; field: PasteField }[];
  let ignored: IgnoredColumn[];
  let data = numbered;
  const notes: string[] = [];
  if (hasHeader) {
    ({ byIndex, columns, ignored } = mapHeadings(numbered[0].cells));
    data = numbered.slice(1);
    // A second heading row right after it (no SKU, only known sub-headings) is skipped.
    const next = data[0];
    const skuIndex = byIndex.indexOf("skuCode");
    if (
      next &&
      next.rowNumber === numbered[0].rowNumber + 1 &&
      (next.cells[skuIndex] ?? "").trim() === "" &&
      next.cells.every((c) => c.trim() === "" || SUB_HEADINGS.has(normalizeHeading(c)))
    ) {
      data = data.slice(1);
      notes.push(SUB_HEADING_NOTE);
    }
    if (!byIndex.includes("skuCode")) {
      return { ok: false, error: 'No SKU column found. Name it "SKU", or paste without a header row in the fixed order.' };
    }
  } else {
    byIndex = [...FIXED_ORDER];
    columns = FIXED_ORDER.map((field) => ({ heading: PASTE_FIELD_LABELS[field], field }));
    ignored = [];
  }

  if (data.length === 0) return { ok: false, error: "Only a header row was pasted. Copy the rows below it too." };
  if (data.length > MAX_SKU_LINES) {
    return { ok: false, error: `A workspace can have at most ${MAX_SKU_LINES} SKUs; this paste has ${data.length} rows.` };
  }

  // Cells past the last mapped column, once each.
  const widest = Math.max(...data.map((r) => r.cells.length));
  for (let i = byIndex.length; i < widest; i++) {
    ignored.push({ heading: `Column ${i + 1}`, reason: hasHeader ? "No heading." : "Beyond the fixed order." });
  }

  const rows = data.map(({ rowNumber, cells }) => {
    const values: Partial<Record<PasteField, string>> = {};
    cells.forEach((cell, i) => {
      const field = byIndex[i];
      if (field) values[field] = cell.trim();
    });
    return { rowNumber, values };
  });
  return { ok: true, hasHeader, columns, ignored, notes, rows };
}

// How LibreOffice Calc evaluates the frozen v1.0 workbook, so the engine gives
// the same answers. LibreOffice, not Excel, is the reference: the golden
// fixtures are LibreOffice recalculations (scripts/forwarder-audit/golden.py).
// Where the two differ (approximate equality, compensated sums), this follows
// LibreOffice.

// A formula's error result (shown as text, e.g. "#VALUE!").
export type XlError = { error: string };
// A formula result: "" is a blank result.
export type Cell = number | string | XlError;
// An input cell: null is an empty cell.
export type Input = number | string | null;

export const VALUE_ERROR: XlError = { error: "#VALUE!" };
export const NA_ERROR: XlError = { error: "#N/A" };

export const isNum = (v: unknown): v is number => typeof v === "number";
export const isErr = (v: unknown): v is XlError => typeof v === "object" && v !== null && "error" in v;

// rtl::math::approxEqual: equal within 2^-48 relative.
const E48 = 2 ** -48;
export function approxEqual(a: number, b: number): boolean {
  if (a === b) return true;
  if (a === 0 || b === 0) return false;
  const d = Math.abs(a - b);
  return Number.isFinite(d) && d < Math.abs(a) * E48 && d < Math.abs(b) * E48;
}

// Calc's + and -: a near-cancellation is exactly 0.
export function add(a: number, b: number): number {
  return ((a < 0 && b > 0) || (b < 0 && a > 0)) && approxEqual(a, -b) ? 0 : a + b;
}
export function sub(a: number, b: number): number {
  return ((a < 0 && b < 0) || (a > 0 && b > 0)) && approxEqual(a, b) ? 0 : a - b;
}

// SUM / SUMIFS: Neumaier-compensated, in row order (Calc's KahanSum).
export function sum(values: number[]): number {
  let total = 0;
  let error = 0;
  for (const x of values) {
    const t = total + x;
    error += Math.abs(total) >= Math.abs(x) ? total - t + x : x - t + total;
    total = t;
  }
  if (approxEqual(total, -error)) return 0;
  return total + error;
}

// ROUND(x, places): half away from zero after rounding to 15 significant
// digits, so ROUND(2.675, 2) is 2.68 (Math.round would give 2.67).
export function round(x: number, places: number): number {
  if (x === 0 || !Number.isFinite(x)) return x;
  const factor = 10 ** places;
  const scaled = Number((Math.abs(x) * factor).toPrecision(15));
  return (Math.sign(x) * Math.floor(scaled + 0.5)) / factor;
}

// Numbers compared as Calc does: approximately equal counts as equal.
export function cmpNum(a: number, b: number): number {
  return approxEqual(a, b) ? 0 : a < b ? -1 : 1;
}

const fold = (s: string) => s.toUpperCase();

// Calc's "=" between two cells: case-insensitive text; an empty cell is 0
// next to a number and "" next to text; a number never equals text.
export function eq(a: Input | Cell, b: Input | Cell): boolean {
  if (isErr(a) || isErr(b)) return false;
  if (a === null && b === null) return true;
  if (a === null) return isNum(b) ? b === 0 : b === "";
  if (b === null) return isNum(a) ? a === 0 : a === "";
  if (isNum(a) && isNum(b)) return cmpNum(a, b) === 0;
  if (typeof a === "string" && typeof b === "string") return fold(a) === fold(b);
  return false;
}

// TRIM: only the plain space; leading, trailing and repeated ones.
export const trim = (s: string) => s.replace(/ +/g, " ").replace(/^ | $/g, "");

// A number joined to text with &: up to 15 significant digits.
export function generalText(n: number): string {
  return String(Number(n.toPrecision(15)));
}

// Text joined with &: an empty cell is "".
export function cat(v: Input | Cell): string {
  if (v === null) return "";
  if (isNum(v)) return generalText(v);
  if (isErr(v)) return v.error;
  return v;
}

// A direct reference to an input cell (=Audit!C23): an empty cell reads as 0.
export const ref = (v: Input): number | string => (v === null ? 0 : v);

// Wildcards in criteria and MATCH: * any run, ? one character, ~ escapes.
function wildcardRegex(pattern: string): RegExp {
  let source = "";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === "~" && i + 1 < pattern.length) source += escapeRegex(pattern[++i]);
    else if (c === "*") source += "[\\s\\S]*";
    else if (c === "?") source += "[\\s\\S]";
    else source += escapeRegex(c);
  }
  return new RegExp(`^${source}$`, "iu");
}
const escapeRegex = (c: string) => c.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
const hasWildcard = (s: string) => /[*?~]/.test(s);

function textEquals(text: string, pattern: string): boolean {
  return hasWildcard(pattern) ? wildcardRegex(pattern).test(text) : fold(text) === fold(pattern);
}

// MATCH(value, list, 0): 1-based position, or 0 when not found (#N/A).
export function matchIndex(value: Input | Cell, list: readonly string[]): number {
  if (value === null || isErr(value)) return 0;
  if (isNum(value)) return 0;
  const i = list.findIndex((item) => textEquals(item, value));
  return i + 1;
}

const collator = new Intl.Collator("en", { sensitivity: "accent" });

// One COUNTIF/COUNTIFS/SUMIFS criterion against one cell: an operator prefix
// (=, <>, <, >, <=, >=), wildcards, case-insensitive whole-cell matching.
export function matchesCriterion(cell: Cell, criterion: string | number): boolean {
  if (isErr(cell)) return false;
  if (isNum(criterion)) return isNum(cell) && cmpNum(cell, criterion) === 0;
  const m = /^(<=|>=|<>|<|>|=)?([\s\S]*)$/.exec(criterion)!;
  const op = m[1] ?? "=";
  const operand = m[2];
  const asNumber = operand.trim() !== "" && Number.isFinite(Number(operand)) ? Number(operand) : null;
  let c: number;
  if (asNumber !== null) {
    if (!isNum(cell)) return op === "<>";
    c = cmpNum(cell, asNumber);
  } else {
    if (isNum(cell)) return op === "<>";
    if (op === "=" || op === "<>") {
      const same = operand === "" ? cell === "" : textEquals(cell, operand);
      return op === "=" ? same : !same;
    }
    if (cell === "") return false;
    c = collator.compare(cell, operand);
  }
  if (op === "=") return c === 0;
  if (op === "<>") return c !== 0;
  if (op === "<") return c < 0;
  if (op === ">") return c > 0;
  if (op === "<=") return c <= 0;
  return c >= 0;
}

export function countIfs(rows: number, ...pairs: [(i: number) => Cell, string | number][]): number {
  let n = 0;
  for (let i = 0; i < rows; i++) if (pairs.every(([get, crit]) => matchesCriterion(get(i), crit))) n++;
  return n;
}

export function sumIfs(rows: number, value: (i: number) => Cell, ...pairs: [(i: number) => Cell, string | number][]): number {
  const picked: number[] = [];
  for (let i = 0; i < rows; i++) {
    const v = value(i);
    if (isNum(v) && pairs.every(([get, crit]) => matchesCriterion(get(i), crit))) picked.push(v);
  }
  return sum(picked);
}

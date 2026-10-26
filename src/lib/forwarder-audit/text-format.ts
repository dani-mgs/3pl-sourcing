import { isErr, isNum, round, type Cell, type Input } from "./calc-semantics";

// The six TEXT() formats the v1.0 workbook uses, as LibreOffice writes them
// (en-US: "," groups, "." decimals; no trailing "." when no decimals remain,
// e.g. TEXT(0, "#,##0.###") is "0"). TEXT of text returns the text; of an
// empty cell, 0.

function fixed(x: number, minDec: number, maxDec: number, group: boolean): string {
  const r = round(x, maxDec);
  const negative = r < 0;
  let [whole, frac = ""] = Math.abs(r).toFixed(maxDec).split(".");
  frac = frac.replace(/0+$/, "");
  while (frac.length < minDec) frac += "0";
  if (group) whole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return (negative ? "-" : "") + whole + (frac ? "." + frac : "");
}

function text(v: Input | Cell, format: (n: number) => string): string {
  if (isErr(v)) return v.error;
  if (v === null) return format(0);
  if (!isNum(v)) return v;
  return format(v);
}

// "#,##0.00"
export const textMoney = (v: Input | Cell) => text(v, (n) => fixed(n, 2, 2, true));
// "#,##0.###"
export const textQty3 = (v: Input | Cell) => text(v, (n) => fixed(n, 0, 3, true));
// "#,##0.##"
export const textQty2 = (v: Input | Cell) => text(v, (n) => fixed(n, 0, 2, true));
// "#,##0.00##"
export const textRate = (v: Input | Cell) => text(v, (n) => fixed(n, 2, 4, true));
// "0.0%"
export const textPercent = (v: Input | Cell) => text(v, (n) => fixed(n * 100, 1, 1, false) + "%");

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY_ZERO = Date.UTC(1899, 11, 30);
const DAY_MS = 86_400_000;

// "d mmm yyyy" of a date serial (day 0 = 1899-12-30), in UTC so the host
// timezone never matters.
export const textDate = (v: Input | Cell) =>
  text(v, (n) => {
    const d = new Date(DAY_ZERO + Math.floor(n) * DAY_MS);
    return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  });

// An ISO date ("2026-06-30") as a date serial.
export function dateSerial(iso: string | null): number | null {
  if (iso === null) return null;
  const [y, m, d] = iso.split("-").map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - DAY_ZERO) / DAY_MS);
}

// A date serial as an ISO date.
export function isoFromSerial(serial: number): string {
  return new Date(DAY_ZERO + serial * DAY_MS).toISOString().slice(0, 10);
}

// Exact arithmetic for duty amounts. HTS rates include fractions ("33 1/3%")
// and money must round once, half-up to the cent, so values are kept as
// bigint fractions until the final rounding. Inputs are decimal strings (or
// numbers from Postgres numeric columns), never binary floats in arithmetic.

export type Rational = { n: bigint; d: bigint };

// BigInt() rather than 0n literals: tsconfig targets ES2017.
const B0 = BigInt(0);
const B1 = BigInt(1);
const B2 = BigInt(2);
const B10 = BigInt(10);
const B100 = BigInt(100);

function gcd(a: bigint, b: bigint): bigint {
  a = a < B0 ? -a : a;
  b = b < B0 ? -b : b;
  while (b !== B0) [a, b] = [b, a % b];
  return a;
}

function normalize(n: bigint, d: bigint): Rational {
  if (d === B0) throw new RangeError("Division by zero");
  if (d < B0) [n, d] = [-n, -d];
  const g = gcd(n, d) || B1;
  return { n: n / g, d: d / g };
}

const DECIMAL = /^-?\d+(\.\d+)?$/;

// "0.3464" → 3464/10000. Accepts a finite number too (as Postgres numeric
// values arrive from PostgREST); it's read via its shortest decimal string.
export function parseDecimal(value: string | number): Rational {
  const text = typeof value === "number" ? numberToDecimalString(value) : value.trim();
  if (!DECIMAL.test(text)) throw new RangeError(`Not a decimal: ${text}`);
  const negative = text.startsWith("-");
  const [whole, fraction = ""] = text.replace("-", "").split(".");
  const n = BigInt(whole + fraction) * (negative ? -B1 : B1);
  return normalize(n, B10 ** BigInt(fraction.length));
}

function numberToDecimalString(value: number): string {
  if (!Number.isFinite(value)) throw new RangeError(`Not a finite number: ${value}`);
  // Avoid exponent notation for very small or large values.
  const text = String(value);
  return /e/i.test(text) ? value.toFixed(12).replace(/\.?0+$/, "") : text;
}

export const ZERO: Rational = { n: B0, d: B1 };

export function fromInteger(value: number | bigint): Rational {
  return { n: BigInt(value), d: B1 };
}

export function fraction(n: number | bigint, d: number | bigint): Rational {
  return normalize(BigInt(n), BigInt(d));
}

export function add(a: Rational, b: Rational): Rational {
  return normalize(a.n * b.d + b.n * a.d, a.d * b.d);
}

export function sub(a: Rational, b: Rational): Rational {
  return normalize(a.n * b.d - b.n * a.d, a.d * b.d);
}

export function mul(a: Rational, b: Rational): Rational {
  return normalize(a.n * b.n, a.d * b.d);
}

export function div(a: Rational, b: Rational): Rational {
  return normalize(a.n * b.d, a.d * b.n);
}

export function compare(a: Rational, b: Rational): number {
  const diff = a.n * b.d - b.n * a.d;
  return diff === B0 ? 0 : diff < B0 ? -1 : 1;
}

// Dollars → whole cents, rounding half away from zero (half-up for the
// non-negative amounts used here).
export function toCents(dollars: Rational): bigint {
  const scaled = dollars.n * B100;
  const q = scaled / dollars.d;
  const r = scaled % dollars.d;
  const absR = r < B0 ? -r : r;
  if (absR * B2 >= dollars.d) return scaled < B0 ? q - B1 : q + B1;
  return q;
}

export function centsToRational(cents: bigint): Rational {
  return normalize(cents, B100);
}

// For storage and display only (amounts well inside Number's exact range).
export function centsToNumber(cents: bigint): number {
  return Number(cents) / 100;
}

// Rounded decimal string with a fixed number of places, for display.
export function toFixed(value: Rational, places: number): string {
  const scale = B10 ** BigInt(places);
  const scaled = value.n * scale;
  let q = scaled / value.d;
  const r = scaled % value.d;
  if ((r < B0 ? -r : r) * B2 >= value.d) q += scaled < B0 ? -B1 : B1;
  const negative = q < B0;
  const digits = (negative ? -q : q).toString().padStart(places + 1, "0");
  const whole = digits.slice(0, digits.length - places);
  const frac = places > 0 ? `.${digits.slice(-places)}` : "";
  return `${negative ? "-" : ""}${whole}${frac}`;
}

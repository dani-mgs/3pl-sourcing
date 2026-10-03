// Small helpers for the seed extractors.

// Chapter 99 heading → its "Rates of Duty 1-General" text, read as:
//   add    "The duty provided in the applicable subheading + 25%" (or "plus
//          25%", "+ a duty of 25%")
//   total  "15%" (column 1 + additional = this rate; U.S. note 16(e)/(f))
//   none   "No change" / "The duty provided in the applicable subheading"
export function readRate(text) {
  const t = text.replace(/\s+/g, " ").trim();
  if (/^no change$/i.test(t) || /^The duty provided in ?the applicable subheading$/.test(t)) return { type: "none", pct: null, text: t };
  const total = /^(\d+(?:\.\d+)?)%$/.exec(t);
  if (total) return { type: "total", pct: total[1], text: t };
  const add = /(?:\+|plus)\s*(?:a duty of\s*)?(\d+(?:\.\d+)?)%$/.exec(t);
  if (add) return { type: "add", pct: add[1], text: t };
  return { type: "other", pct: null, text: t };
}

export function headingRates(ch99) {
  const rates = new Map();
  for (const row of ch99) {
    const heading = row.htsno ?? "";
    if (/^9903\.\d{2}\.\d{2}$/.test(heading) && row.general) rates.set(heading, readRate(row.general));
  }
  return rates;
}

// Deterministic sample: the same pool, size and key always give the same
// codes (mulberry32 seeded from the key and a fixed seed), sorted by code.
const SEED = 20261003;

function hash(key) {
  let h = SEED;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 2654435761) >>> 0;
  return h;
}

function mulberry32(a) {
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function sample(pool, n, key) {
  const items = [...pool];
  const random = mulberry32(hash(key));
  const count = Math.min(n, items.length);
  for (let i = 0; i < count; i++) {
    const j = i + Math.floor(random() * (items.length - i));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items.slice(0, count).sort((a, b) => a.prefix.localeCompare(b.prefix));
}

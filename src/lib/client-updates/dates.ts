// Dates in client updates. Date-only values (due dates, milestones, quote
// validity) stay "YYYY-MM-DD" strings and are formatted without the local
// timezone, so they read the same on every server and in every browser.
// "Today" is the server's UTC date (as on the staff pages); see
// docs/TECH_DEBT.md, "Portal 'today' is UTC".

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

// A real calendar date in "YYYY-MM-DD" form (rejects 2026-02-30).
export function isIsoDate(value: string): boolean {
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const [y, m, d] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

function dayNumber(isoDate: string): number {
  const [y, m, d] = isoDate.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
}

// The server's date in UTC, "YYYY-MM-DD".
export function utcToday(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

// Whole days from `from` to `to` (negative when `to` is earlier).
export function daysBetween(from: string, to: string): number {
  return dayNumber(to) - dayNumber(from);
}

// "Oct 17", or "Oct 17, 2027" when the year differs from `today`'s.
export function formatDateOnly(isoDate: string, today?: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const short = `${MONTHS[m - 1]} ${d}`;
  return today && Number(today.slice(0, 4)) !== y ? `${short}, ${y}` : short;
}

// A timestamp's UTC calendar date, for server-rendered fallbacks.
export function utcDateOf(timestamp: string): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

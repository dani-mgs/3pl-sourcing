import { describeRowRate, rowApplies, type DutyRow } from "./additional-duties";
import { addDaysUtc } from "./entry-date";

// Scheduled rate changes that could affect an estimate: dated
// additional-duty rows of a program that bears on this line (reviewed), for
// this origin and HTS code, that start or end shortly after the entry date.
// The data only knows the rows that have been loaded: when there are none,
// nothing is shown (the estimate already says later changes aren't included).

// A change is "soon" when it takes effect after the entry date and within
// this many days of it.
export const SCHEDULED_CHANGE_WINDOW_DAYS = 45;

export type ScheduledChange = {
  programKey: string;
  programName: string;
  // The day the change takes effect: a row's start, or the day after its last day.
  date: string;
  kind: "starts" | "ends";
  // "9903.91.12" or "9903.88.69, 9903.88.70", with what each does.
  headings: string[];
  description: string;
};

export function scheduledChanges(input: {
  // Every additional-duty row, with scope lines for this HTS code.
  rows: DutyRow[];
  // Programs that bear on this line and have been reviewed (counted).
  reviewedPrograms: Map<string, string>;
  originCountry: string;
  htsCode: string;
  entryDate: string;
}): ScheduledChange[] {
  const { rows, reviewedPrograms, originCountry, htsCode, entryDate } = input;
  const last = addDaysUtc(entryDate, SCHEDULED_CHANGE_WINDOW_DAYS);
  const inWindow = (date: string) => date > entryDate && date <= last;

  const groups = new Map<string, ScheduledChange>();
  const add = (row: DutyRow, kind: "starts" | "ends", date: string) => {
    const key = `${row.program_key}|${date}|${kind}`;
    const programName = reviewedPrograms.get(row.program_key)!;
    const text = `${row.chapter99_heading} ${row.label}${kind === "starts" ? `: ${describeRowRate(row)}` : " ends"}`;
    const existing = groups.get(key);
    if (existing) {
      existing.headings.push(row.chapter99_heading);
      existing.description += `; ${text}`;
    } else {
      groups.set(key, { programKey: row.program_key, programName, date, kind, headings: [row.chapter99_heading], description: text });
    }
  };

  for (const row of rows) {
    if (!reviewedPrograms.has(row.program_key)) continue;
    if (!rowApplies(row, originCountry, htsCode)) continue;
    if (row.effective_from > entryDate && inWindow(row.effective_from)) add(row, "starts", row.effective_from);
    // A row in force on the entry date that ends within the window.
    if (row.effective_from <= entryDate && row.effective_to != null && row.effective_to >= entryDate) {
      const change = addDaysUtc(row.effective_to, 1);
      if (inWindow(change)) add(row, "ends", change);
    }
  }
  return [...groups.values()].sort((a, b) => a.date.localeCompare(b.date) || a.programName.localeCompare(b.programName));
}

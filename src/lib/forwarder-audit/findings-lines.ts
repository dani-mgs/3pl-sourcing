import { NA_ERROR, cat, cmpNum, eq, isErr, isNum, matchIndex, round, type Cell } from "./calc-semantics";
import { text } from "./cargo";
import { findingRow } from "./finding-row";
import { FLAG_NAMES, REVIEWER_FLAGS } from "./lists";
import { textMoney, textRate } from "./text-format";
import type { AuditInputs, CoverageResult, FindingRow, LineResult } from "./types";

// The per-service checks (Checks rows 99-119: coverage, Incoterm payer, not
// requested) and the per-line checks (rows 120-319: amount error, agreed
// rate, question, unpriced), in sheet order.

const DUTIES_PRICE_ACTION = "Ask for the duty rate, customs value and amounts; a licensed broker should confirm the HS code and any preferential rate.";

export function serviceFindings(inputs: AuditInputs, coverage: CoverageResult[]): FindingRow[] {
  const itemisedNo = eq(text(inputs.shipment.quotationItemised), "No");
  const incoterm = cat(text(inputs.shipment.incoterm));
  return coverage.flatMap((c, s) => {
    const row = 99 + 3 * s;
    const lower = c.service.toLowerCase();
    const j = c.coverage;
    const isJ = (v: string) => eq(j, v);
    return [
      findingRow(`COV${s}`, row, isJ("Excluded") ? "Risk" : "Question", () => eq(c.requested, "Yes") && (isJ("Not addressed") || isJ("Excluded") || isJ("Unpriced")), () => ({
        charge: c.service,
        issue: isJ("Not addressed") ? "Requested service not addressed" : isJ("Excluded") ? "Requested service excluded" : "Requested service not priced",
        explanation: isJ("Excluded")
          ? "The quotation excludes this service, but the client needs it."
          : isJ("Unpriced")
            ? "Lines exist but carry no amount (at cost / TBC)."
            : itemisedNo
              ? "Only covered by the forwarder's lump-sum or door-to-door claim; no itemised charge confirms it."
              : "The quotation says nothing about this requested service.",
        action: isJ("Excluded")
          ? "Tell the client to arrange and budget for this service separately."
          : isJ("Unpriced")
            ? s === 6
              ? DUTIES_PRICE_ACTION
              : `Ask the forwarder to price ${lower}.`
            : itemisedNo
              ? "Ask the forwarder to itemise this service or confirm in writing that it is included."
              : "Ask the forwarder to quote it or confirm it is excluded.",
      })),
      findingRow(`INC${s}`, row + 1, "Question", () => c.mismatchParty !== "" && c.firmAmount > 0, () => ({
        charge: `${c.service} charges (${c.firmLines} line(s))`,
        issue: `May be the ${c.mismatchParty}'s cost under ${incoterm}`,
        explanation: `Under ${incoterm}, the ${c.mismatchParty} normally pays ${lower} charges.`,
        action: `Confirm with the client who pays; if the ${c.mismatchParty}, remove these charges from this quotation.`,
        amount: c.firmAmount,
      })),
      findingRow(`OUT${s}`, row + 2, "Question", () => eq(c.requested, "No") && c.firmAmount > 0, () => ({
        charge: c.service,
        issue: "Charged for a service the client did not request",
        explanation: "The client did not ask for this service.",
        action: "Ask the forwarder to remove it, or confirm with the client that it is needed.",
        amount: c.firmAmount,
      })),
    ];
  });
}

const QUESTIONS: Record<string, [issue: string, explanation: string, action: string]> = {
  status: ["Status missing", "No status entered for this line.", "Set the line status."],
  basis: [
    "Charging unit not stated",
    "The quotation does not say per what unit this is charged.",
    "Ask the forwarder for the charging unit (per container, per B/L, per CBM...).",
  ],
  rate: ["Rate missing", "No rate entered for a firm or estimated charge.", "Enter the rate, or set the status to At cost / TBC."],
  base: ["Base amount not stated", "A percentage charge needs the amount it is calculated on.", "Ask the forwarder for the base amount (e.g. customs value)."],
  unclass: ["Charge not explained", "The charge does not fit a standard category or its purpose is unclear.", "Ask the forwarder what this charge covers."],
  dup: [
    "Possible duplicate (same name, same service)",
    "The same charge name appears more than once in the same service.",
    "Ask whether both lines are needed; remove the duplicate.",
  ],
  noagree: [
    "Charge not in the rate agreement",
    "A rate agreement was provided but has no rate for this charge.",
    "Ask why the charge is not in the agreement; check the contract.",
  ],
};

function flagTexts(l: LineResult, note: string) {
  // INDEX(..., MATCH(flag, ...)): an unknown flag is #N/A.
  const i = matchIndex(text(l.flag), FLAG_NAMES);
  const f = i > 0 ? REVIEWER_FLAGS[i - 1] : null;
  return {
    issue: f ? f.issue : NA_ERROR,
    explanation: note !== "" ? note : f ? f.explanation : NA_ERROR,
    action: f ? f.action : NA_ERROR,
    useLineAmount: f ? f.useLineAmount : 0,
  };
}

export function lineFindings(inputs: AuditInputs, lines: LineResult[]): FindingRow[] {
  return lines.flatMap((l, i) => {
    const row = 120 + 4 * i;
    const charge = `Line ${l.line}: ${l.name}`;
    const input = inputs.lines[i];
    const kind = l.questionKind;
    return [
      findingRow(`LE${i}`, row, "Error", () => !isErr(l.check) && eq(String(l.check).slice(0, 5), "Error"), () => ({
        charge,
        issue: "Line amount does not reconcile",
        explanation:
          `Forwarder shows ${textMoney(l.forwarderTotal)} vs calculated ${textMoney(l.preTax)}` +
          (cmpNum(l.taxRate, 0) > 0 ? ` before tax / ${textMoney(l.inclTax)} incl. tax` : "") +
          ` ${cat(l.currency)}`,
        action: "Ask the forwarder to correct the amount or explain the difference.",
        amount: isNum(l.fx) ? round((l.difference as number) * l.fx, 2) : "",
      })),
      findingRow(`LA${i}`, row + 1, "Error", () => l.agreedExcess > 0, () => ({
        charge,
        issue: "Rate above the agreed rate",
        explanation: `Quoted ${textRate(l.rate)} vs agreed ${textRate(input?.agreedRate ?? null)} ${input?.basis ?? ""}`,
        action: "Ask the forwarder to apply the agreed rate.",
        amount: l.agreedExcess,
      })),
      findingRow(`LQ${i}`, row + 2, "Question", () => kind !== "", () => {
        if (kind === "flag") {
          const f = flagTexts(l, input?.note ?? "");
          const amount: Cell = f.useLineAmount === 1 && isNum(l.total) ? l.total : "";
          return { charge, issue: f.issue, explanation: f.explanation, action: f.action, amount };
        }
        const [issue, explanation, action] = QUESTIONS[kind];
        return { charge, issue, explanation, action, amount: kind === "dup" && isNum(l.total) ? l.total : "" };
      }),
      findingRow(`LR${i}`, row + 3, "Risk", () => l.unpriced === 1 && !eq(l.service, "Duties & taxes"), () => ({
        charge,
        issue: eq(l.status, "TBC") ? "Amount to be confirmed" : "Charged at cost - amount not quoted",
        explanation: "The final cost is unknown until invoiced.",
        action: "Ask for an indicative amount; tell the client it may be added.",
      })),
    ];
  });
}

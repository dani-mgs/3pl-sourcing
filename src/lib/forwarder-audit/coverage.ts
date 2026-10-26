import { cat, countIfs, eq, matchIndex, sumIfs, type Cell } from "./calc-semantics";
import { text } from "./cargo";
import { INCOTERM_PAYERS, INCOTERMS, MAX_LINES, SERVICES } from "./lists";
import type { AuditInputs, CoverageResult, LineResult } from "./types";

// Section 3: each requested service's coverage from the charge lines, its
// firm amount and who normally pays it under the Incoterm (Checks rows 55-61).

export function calculateCoverage(inputs: AuditInputs, lines: LineResult[]): CoverageResult[] {
  const service = (j: number): Cell => lines[j].service;
  const status = (j: number): Cell => lines[j].status;
  const incotermIndex = matchIndex(text(inputs.shipment.incoterm), INCOTERMS);
  const role = text(inputs.shipment.clientRole);
  return SERVICES.map((name, s) => {
    const input = inputs.services[s] ?? { requested: "", mark: "" };
    const requested = cat(text(input.requested));
    const pricedLines = sumIfs(MAX_LINES, (j) => lines[j].priced, [service, name]);
    const unpricedLines = sumIfs(MAX_LINES, (j) => lines[j].unpriced, [service, name]);
    const includedLines = countIfs(MAX_LINES, [service, name], [status, "Included"]);
    const excludedLines = countIfs(MAX_LINES, [service, name], [status, "Excluded"]);
    const notApplicableLines = countIfs(MAX_LINES, [service, name], [status, "Not applicable"]);
    const found =
      pricedLines > 0
        ? "Priced"
        : unpricedLines > 0
          ? "Unpriced"
          : includedLines > 0
            ? "Included"
            : excludedLines > 0
              ? "Excluded"
              : notApplicableLines > 0
                ? "Not applicable"
                : "No lines";
    const mark = cat(text(input.mark));
    const coverage = mark !== "" ? mark : found === "No lines" ? (eq(requested, "Yes") ? "Not addressed" : "-") : found;
    const payer = incotermIndex > 0 ? INCOTERM_PAYERS[incotermIndex - 1].payers[s] : "";
    const mismatchParty = eq(role, "Buyer") && eq(payer, "Seller") ? "seller" : eq(role, "Seller") && eq(payer, "Buyer") ? "buyer" : "";
    return {
      service: name,
      requested,
      pricedLines,
      unpricedLines,
      includedLines,
      excludedLines,
      notApplicableLines,
      found,
      mark,
      coverage,
      firmAmount: sumIfs(MAX_LINES, (j) => lines[j].total, [service, name], [status, "Firm"]),
      payer,
      firmLines: countIfs(MAX_LINES, [service, name], [status, "Firm"], [(j) => lines[j].priced, 1]),
      mismatchParty,
    };
  });
}

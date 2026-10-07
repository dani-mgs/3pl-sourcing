import { formatCurrency } from "@/lib/currency";
import { formatRateDate } from "@/lib/fx/rate-provenance";
import type { EstimateLine } from "./calculate";
import { matchesProgramTrigger, type DutyProgramRow, type ProgramWarning } from "./programs";
import {
  ZERO,
  centsToNumber,
  centsToRational,
  div,
  fromInteger,
  mul,
  parseDecimal,
  sub,
  toCents,
  toFixed,
  type Rational,
} from "./rational";

// Additional duties (Section 301, Section 232 and others) on top of the base
// duty.
//
// Only rows of REVIEWED programs count toward the total. A pending program is
// evaluated the same way, but only to describe what it would add ("pending
// expert review — could add up to 12.5%"), and a program with no rows yet
// falls back to its indicative HTS rate. Rules, from U.S. notes 16, 20, 31,
// 50 and 52:
//   - duties of different programs stack (note 52(a), 50(a)(i), 20, 31);
//   - within a program one row applies (note 16(a): the 232 metal headings
//     are mutually exclusive). The most specific row wins: a row whose
//     condition is assumed, then a row for named origins (fewer first), then
//     the longest matching HTS line. Only confirmed (charging) rows can be the
//     charged row: an unconfirmed row never displaces one, however specific
//     it is; it is named on the line ("could be +100% (...) instead, not yet
//     confirmed"). Rows that still tie: the highest charge applies and
//     the others are named, so a data question never understates the duty;
//   - a scope line marked excluded takes its statistical number out of the
//     row ("8-digit subheading except 10-digit number");
//   - conditions the calculator can't check (UK melt, U.S. metal content,
//     USMCA, end use): rows whose condition isn't assumed only add a note
//     ("could be +25% (9903.82.04) instead if …"; "may be exempt if …"), so
//     the higher duty applies; rows whose condition is assumed (a raising
//     fact) apply with "assumes …". Which way each row goes is data
//     (assume_condition), so experts can change it;
//   - unconfirmed rows are never charged: the program is named "may apply"
//     only when no confirmed row applies, and the row is noted otherwise;
//   - a row doesn't apply when a program in its excludes_programs applies
//     (note 52(f), 50(a)(vi): Section 232 goods); if that program isn't
//     settled yet (not loaded, or pending review) but may apply, the row is
//     named "exempt if … applies", never charged or hinted with a percentage;
//   - minimum_total: column 1 rate + additional = at least the minimum, with
//     specific/compound rates read as duty / customs value (note 52(k),
//     16(e)-(f));
//   - exemptions apply only when their scope matches without conditions;
//     product exclusions and particular articles within a subheading are
//     shown as "may be exempt if the article is …" (with their end date) and
//     never applied.
// Pure: rows, reviews and the base duty are passed in.

export type ScopeLine = { hts_prefix: string; article_description: string | null; excluded?: boolean };

export type DutyRow = {
  id: string;
  program_key: string;
  chapter99_heading: string;
  chapter99_heading_at_minimum: string | null;
  label: string;
  rate_type: "add" | "minimum_total" | "exempt" | "unconfirmed";
  rate_pct: number | string | null;
  origin_countries: string[] | null;
  hts_scope: "all" | "listed";
  condition_text: string | null;
  // Whether the calculator treats condition_text as met (seeded true only
  // where the condition raises the duty).
  assume_condition?: boolean;
  excludes_programs: string[];
  exclusion_heading: string | null;
  filing_order: number;
  effective_from: string;
  effective_to: string | null;
  legal_status: "in_force" | "in_force_under_litigation" | "enjoined" | "expired";
  source_label: string;
  source_url: string;
  source_checked_on: string;
  scope: ScopeLine[];
};

export type ReviewStatus = "not_loaded" | "pending_review" | "reviewed";

export type ProgramReview = {
  programKey: string;
  status: ReviewStatus;
  reviewedAt: string | null;
  reviewedByName: string | null;
  // Chapter 99 headings near this program's that changed since its review.
  chapter99ChangesSinceReview: number;
};

export type DutyReviewNote = {
  programKey: string;
  name: string;
  status: ReviewStatus;
  reviewedAt: string | null;
  reviewedByName: string | null;
  // Why the review may be out of date, or null.
  staleReason: string | null;
};

export const REVIEW_STALE_AFTER_DAYS = 30;

export const LEGAL_STATUS_LABELS: Record<DutyRow["legal_status"], string> = {
  in_force: "In force",
  in_force_under_litigation: "In force — under litigation",
  enjoined: "Enjoined",
  expired: "Expired",
};

type Context = {
  originCountry: string;
  htsCode: string;
  customsValueUsd: Rational;
  // The rounded base duty line (column 1 or 2).
  baseDutyUsd: Rational;
};

type Charge = {
  kind: "charge";
  row: DutyRow;
  heading: string;
  cents: bigint;
  detail: string;
  // Caveats shown under the line: conditional exemptions and rates, ties,
  // unconfirmed rows, statistical numbers the row doesn't cover.
  notes: string[];
  // A conditional exemption may take the line out of this program.
  mayBeExempt: boolean;
};

type Outcome =
  | { kind: "not_applicable" }
  | { kind: "exempt"; heading: string; reason: string; notes: string[] }
  | { kind: "depends_on"; heading: string; programs: string[] }
  // The best match is a row whose rate isn't confirmed: named, not counted.
  | { kind: "unconfirmed"; row: DutyRow; notes: string[] }
  // Only rows with unmet conditions (or other statistical numbers) match.
  | { kind: "conditional"; notes: string[] }
  | Charge;

const usd = (value: Rational) => formatCurrency(centsToNumber(toCents(value)), "USD");
const pct = (value: Rational, places = 2) => `${toFixed(value, places).replace(/\.?0+$/, "")}%`;
const HUNDRED = fromInteger(100);

function originMatches(row: DutyRow, origin: string): boolean {
  return row.origin_countries == null || row.origin_countries.includes(origin);
}

const formatCode = (p: string) =>
  p.length >= 8 ? `${p.slice(0, 4)}.${p.slice(4, 6)}.${p.slice(6)}` : p.length === 6 ? `${p.slice(0, 4)}.${p.slice(4)}` : p;

type ScopeMatch = {
  // Length of the most specific matching line (0 for 'all' scope).
  prefixLength: number;
  lines: ScopeLine[];
  // Statistical numbers under a shorter code that the row leaves out.
  exceptNumbers: string[];
};

// How a row's scope covers this code: the most specific matching line
// decides, and an excluded line takes its number out.
function scopeMatch(row: DutyRow, htsCode: string): ScopeMatch | null {
  if (row.hts_scope === "all") return { prefixLength: 0, lines: [{ hts_prefix: "", article_description: null }], exceptNumbers: [] };
  const hits = row.scope.filter((s) => htsCode.startsWith(s.hts_prefix));
  if (hits.length === 0) return null;
  const longest = Math.max(...hits.map((h) => h.hts_prefix.length));
  if (hits.some((h) => h.excluded && h.hts_prefix.length === longest)) return null;
  const exceptNumbers = row.scope
    .filter((s) => s.excluded && s.hts_prefix.length > htsCode.length && s.hts_prefix.startsWith(htsCode))
    .map((s) => formatCode(s.hts_prefix));
  return { prefixLength: longest, lines: hits.filter((h) => !h.excluded), exceptNumbers };
}

// Lines of the row listed only at a longer code than the one entered.
function childNumbers(row: DutyRow, htsCode: string): string[] {
  if (row.hts_scope === "all" || htsCode.length >= 10) return [];
  return row.scope
    .filter((s) => !s.excluded && s.hts_prefix.length > htsCode.length && s.hts_prefix.startsWith(htsCode))
    .map((s) => formatCode(s.hts_prefix));
}

export function inForceOn(row: { effective_from: string; effective_to: string | null }, date: string): boolean {
  return row.effective_from <= date && (row.effective_to == null || row.effective_to >= date);
}

type ExclusionState = { state: "applies" | "does_not_apply" | "unknown"; uncertain?: boolean };

const isConditional = (row: DutyRow) => Boolean(row.condition_text);
const isAssumed = (row: DutyRow) => isConditional(row) && row.assume_condition === true;

function rateText(row: DutyRow): string {
  const rate = pct(parseDecimal(row.rate_pct ?? "0"), 4);
  if (row.rate_type === "minimum_total") return `a minimum total of ${rate}`;
  return `+${rate}`;
}

// What a charging row adds for this line.
function chargeFor(row: DutyRow, ctx: Context): { cents: bigint; heading: string; detail: string } {
  const rate = parseDecimal(row.rate_pct ?? "0");
  if (row.rate_type === "add") {
    const amount = div(mul(ctx.customsValueUsd, rate), HUNDRED);
    return { cents: toCents(amount), heading: row.chapter99_heading, detail: `${pct(rate, 4)} of ${usd(ctx.customsValueUsd)}` };
  }
  // minimum_total: top up the base duty to the minimum.
  const minimum = div(mul(ctx.customsValueUsd, rate), HUNDRED);
  const baseRate = div(mul(ctx.baseDutyUsd, HUNDRED), ctx.customsValueUsd);
  const topUp = sub(minimum, ctx.baseDutyUsd);
  if (topUp.n <= ZERO.n) {
    return {
      cents: toCents(ZERO),
      heading: row.chapter99_heading_at_minimum ?? row.chapter99_heading,
      detail: `Base rate ${pct(baseRate)} already meets the ${pct(rate, 4)} minimum; nothing added`,
    };
  }
  return {
    cents: toCents(topUp),
    heading: row.chapter99_heading,
    detail: `Minimum total ${pct(rate, 4)}: ${usd(minimum)} less base duty ${usd(ctx.baseDutyUsd)} (base rate ${pct(baseRate)})`,
  };
}

const centsUsd = (cents: bigint) => usd(centsToRational(cents));

type Candidate = { row: DutyRow; match: ScopeMatch };

// Higher ranks win (see the header): assumed condition, named origins, fewer
// origins, longer HTS line, charging over unconfirmed.
function rank(c: Candidate): number[] {
  return [
    isAssumed(c.row) ? 1 : 0,
    c.row.origin_countries ? 1 : 0,
    -(c.row.origin_countries?.length ?? 0),
    c.match.prefixLength,
    c.row.rate_type === "unconfirmed" ? 0 : 1,
  ];
}

function compareRank(a: number[], b: number[]): number {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return b[i] - a[i];
  return 0;
}

function evaluate(
  programKey: string,
  rows: DutyRow[],
  ctx: Context,
  exclusionState: (programKey: string) => ExclusionState,
  programName: (programKey: string) => string,
  ignoreExclusions = false,
): Outcome {
  const mine = rows.filter((r) => r.program_key === programKey && originMatches(r, ctx.originCountry));
  const matched: Candidate[] = [];
  for (const row of mine) {
    const match = scopeMatch(row, ctx.htsCode);
    if (match) matched.push({ row, match });
  }
  const charging = (c: Candidate) => c.row.rate_type === "add" || c.row.rate_type === "minimum_total";
  const bySpecificity = (a: Candidate, b: Candidate) =>
    compareRank(rank(a), rank(b)) || a.row.chapter99_heading.localeCompare(b.row.chapter99_heading);
  // Only confirmed rows can be charged; unconfirmed ones are named, never chosen over them.
  const candidates = matched
    .filter((c) => charging(c) && (!isConditional(c.row) || isAssumed(c.row)))
    .sort(bySpecificity);
  const unconfirmedMatches = matched.filter((c) => c.row.rate_type === "unconfirmed").sort(bySpecificity);
  const alternatives = matched.filter((c) => charging(c) && isConditional(c.row) && !isAssumed(c.row));

  const notes: string[] = [];
  // Rows covering only some statistical numbers under the code entered.
  for (const row of mine) {
    const children = childNumbers(row, ctx.htsCode);
    if (children.length > 0 && row.rate_type !== "exempt") {
      notes.push(
        `${row.chapter99_heading} (${row.rate_type === "unconfirmed" ? "unconfirmed" : rateText(row)}) applies to statistical number${children.length === 1 ? "" : "s"} ${children.join(", ")}; enter the 10-digit number for an exact estimate`,
      );
    }
  }
  const couldBe = (alt: Candidate) => {
    const charge = chargeFor(alt.row, ctx);
    return `${alt.row.chapter99_heading}: could be ${rateText(alt.row)} instead (about ${centsUsd(charge.cents)}) if ${alt.row.condition_text}`;
  };

  const top = candidates[0];
  if (!top) {
    // Nothing confirmed applies: an unconfirmed match is named as "may apply".
    if (unconfirmedMatches.length > 0) {
      return { kind: "unconfirmed", row: unconfirmedMatches[0].row, notes: [...alternatives.map(couldBe), ...notes] };
    }
    const conditional = [...alternatives.map(couldBe), ...notes];
    return conditional.length > 0 ? { kind: "conditional", notes: conditional } : { kind: "not_applicable" };
  }
  // A more specific unconfirmed row could replace the charged one; a less
  // specific one is just not included.
  const unconfirmedNote = (c: Candidate) =>
    compareRank(rank(c), rank(top)) < 0
      ? `Could be ${rateText(c.row)} (${c.row.chapter99_heading}) instead, not yet confirmed: ${c.row.condition_text ?? c.row.label}`
      : `${c.row.chapter99_heading} (rate unconfirmed, not included): ${c.row.condition_text ?? c.row.label}`;

  // Equal-ranked charging rows: the highest charge applies, the rest are named.
  const tied = candidates.filter((c) => charging(c) && compareRank(rank(c), rank(top)) === 0);
  const priced = tied.map((c) => ({ c, charge: chargeFor(c.row, ctx) })).sort((a, b) => (b.charge.cents > a.charge.cents ? 1 : b.charge.cents < a.charge.cents ? -1 : 0));
  const chosen = priced[0];
  const row = chosen.c.row;
  for (const other of priced.slice(1)) {
    notes.push(
      ctx.htsCode.length < 10
        ? `Also listed under ${other.c.row.chapter99_heading} (${rateText(other.c.row)}); which applies depends on the 10-digit statistical number, so the higher is shown`
        : `Also matches ${other.c.row.chapter99_heading} (${rateText(other.c.row)}); only one applies — the higher is shown pending expert confirmation`,
    );
  }
  if (chosen.c.match.exceptNumbers.length > 0) {
    notes.push(`${row.chapter99_heading} doesn't apply to statistical number${chosen.c.match.exceptNumbers.length === 1 ? "" : "s"} ${chosen.c.match.exceptNumbers.join(", ")}`);
  }
  if (isAssumed(row)) {
    const next = candidates.find((c) => c !== chosen.c && charging(c) && !isAssumed(c.row));
    notes.push(
      `Assumes ${row.condition_text}; if not, ${next ? `${next.row.chapter99_heading} (${rateText(next.row)}) applies instead` : "this program adds nothing"}`,
    );
  }
  for (const alt of alternatives) notes.push(couldBe(alt));
  for (const c of unconfirmedMatches) notes.push(unconfirmedNote(c));

  // Exemptions: definite (or assumed) ones apply; conditional ones are listed.
  const mayBeExempt: string[] = [];
  for (const { row: ex, match } of matched.filter((c) => c.row.rate_type === "exempt")) {
    const until = ex.effective_to ? ` (${ex.label}, through ${formatRateDate(ex.effective_to)})` : "";
    const unconditional = !isConditional(ex) && match.lines.some((l) => !l.article_description);
    if (unconditional || isAssumed(ex)) {
      return {
        kind: "exempt",
        heading: ex.chapter99_heading,
        reason: ex.label,
        notes: isAssumed(ex) ? [`Assumes ${ex.condition_text}`] : [],
      };
    }
    if (ex.condition_text) mayBeExempt.push(`${ex.chapter99_heading}${until}: may be exempt if ${ex.condition_text}`);
    for (const l of match.lines.filter((x) => x.article_description)) {
      mayBeExempt.push(`${ex.chapter99_heading}${until}: may be exempt if the article is: ${l.article_description}${until ? ". Verify before relying on it" : ""}`);
    }
  }

  // Programs that exclude this one (e.g. Section 232 goods).
  if (!ignoreExclusions) {
    const states = row.excludes_programs.map((key) => [key, exclusionState(key)] as const);
    const applying = states.find(([, s]) => s.state === "applies");
    if (applying) {
      const exemptNotes: string[] = [];
      if (applying[1].uncertain) {
        // The excluding program may not apply after all (e.g. metal under 15%
        // of the weight): say what this one would add then.
        const fallback = evaluate(programKey, rows, ctx, exclusionState, programName, true);
        if (fallback.kind === "charge" && fallback.cents > BigInt(0)) {
          const share = div(mul(centsToRational(fallback.cents), HUNDRED), ctx.customsValueUsd);
          exemptNotes.push(
            `If ${programName(applying[0])} doesn't apply (see its notes), this program adds ${pct(share)} (about ${centsUsd(fallback.cents)}, ${fallback.heading}) instead`,
          );
        }
      }
      return {
        kind: "exempt",
        heading: row.exclusion_heading ?? row.chapter99_heading,
        reason: `${programName(applying[0])} applies`,
        notes: exemptNotes,
      };
    }
    const unknown = states.filter(([, s]) => s.state === "unknown").map(([key]) => programName(key));
    if (unknown.length > 0) {
      return { kind: "depends_on", heading: row.exclusion_heading ?? row.chapter99_heading, programs: unknown };
    }
  }

  return { kind: "charge", row, ...chosen.charge, notes: [...mayBeExempt, ...notes], mayBeExempt: mayBeExempt.length > 0 };
}

export type AdditionalDutiesInput = {
  programs: DutyProgramRow[];
  // In force on the estimate's date, with their scope lines.
  rows: DutyRow[];
  reviews: ProgramReview[];
  originCountry: string;
  htsCode: string;
  customsValueUsd: Rational;
  baseDutyUsd: Rational;
  asOfDate: string;
};

export type AdditionalDutiesResult = {
  lines: EstimateLine[];
  additionalDutiesUsd: number;
  // Programs that may apply but aren't in the total, plus notes about
  // pending exemptions (counted: false).
  warnings: ProgramWarning[];
  dutyReviews: DutyReviewNote[];
};

function daysBetween(fromIso: string, toDate: string): number {
  const from = Date.UTC(+fromIso.slice(0, 4), +fromIso.slice(5, 7) - 1, +fromIso.slice(8, 10));
  const to = Date.UTC(+toDate.slice(0, 4), +toDate.slice(5, 7) - 1, +toDate.slice(8, 10));
  return Math.floor((to - from) / 86_400_000);
}

export function staleReason(review: ProgramReview, asOfDate: string): string | null {
  if (review.status !== "reviewed" || !review.reviewedAt) return null;
  const reasons: string[] = [];
  const age = daysBetween(review.reviewedAt, asOfDate);
  if (age > REVIEW_STALE_AFTER_DAYS) reasons.push(`last reviewed ${age} days ago`);
  if (review.chapter99ChangesSinceReview > 0) {
    const n = review.chapter99ChangesSinceReview;
    reasons.push(`${n} Chapter 99 heading${n === 1 ? "" : "s"} changed in the HTS since`);
  }
  return reasons.length > 0 ? reasons.join("; ") : null;
}

export function evaluateAdditionalDuties(input: AdditionalDutiesInput): AdditionalDutiesResult {
  const ctx: Context = {
    originCountry: input.originCountry,
    htsCode: input.htsCode,
    customsValueUsd: input.customsValueUsd,
    baseDutyUsd: input.baseDutyUsd,
  };
  const reviewOf = new Map(input.reviews.map((r) => [r.programKey, r]));
  const programOf = new Map(input.programs.map((p) => [p.key, p]));
  const statusOf = (key: string): ReviewStatus =>
    input.rows.some((r) => r.program_key === key) ? (reviewOf.get(key)?.status ?? "pending_review") : "not_loaded";
  const nameOf = (key: string) => programOf.get(key)?.name ?? key;

  // Whether a program that excludes another applies to this line. Programs
  // with rows are evaluated: a reviewed one that charges applies (uncertain
  // when a conditional exemption could take the line out); a pending one, or
  // an unconfirmed match, may apply. Programs without rows "may apply" when
  // their warning trigger matches. Neither can be settled yet.
  const exclusionState = (key: string, depth = 0): ExclusionState => {
    const program = programOf.get(key);
    if (!program || program.status === "inactive") return { state: "does_not_apply" };
    const status = statusOf(key);
    if (status !== "not_loaded" && depth < 2) {
      const outcome = evaluate(key, input.rows, ctx, (k) => exclusionState(k, depth + 1), nameOf);
      if (outcome.kind === "charge") {
        return status === "reviewed" ? { state: "applies", uncertain: outcome.mayBeExempt } : { state: "unknown" };
      }
      if (outcome.kind === "depends_on" || outcome.kind === "unconfirmed") return { state: "unknown" };
      return { state: "does_not_apply" };
    }
    if (status !== "not_loaded") return { state: "does_not_apply" };
    return matchesProgramTrigger(program, input.originCountry, input.htsCode) ? { state: "unknown" } : { state: "does_not_apply" };
  };

  const lines: EstimateLine[] = [];
  const warnings: ProgramWarning[] = [];
  const dutyReviews: DutyReviewNote[] = [];
  let additionalCents = BigInt(0);

  const active = input.programs
    .filter((p) => p.status !== "inactive")
    .sort((a, b) => a.sort_order - b.sort_order);

  for (const program of active) {
    const status = statusOf(program.key);
    const base = { programKey: program.key, name: program.name, sourceLabel: program.source_label, sourceUrl: program.source_url };

    if (status === "not_loaded") {
      if (!matchesProgramTrigger(program, input.originCountry, input.htsCode)) continue;
      const flat = program.indicative_rates?.[input.originCountry];
      const indicativePct = typeof flat === "number" && flat > 0 ? flat : null;
      warnings.push({
        ...base,
        kind: "not_loaded",
        text: program.warning_text,
        indicativePct,
        hint:
          indicativePct == null
            ? null
            : `could add up to ${indicativePct}% (about ${usd(div(mul(input.customsValueUsd, parseDecimal(indicativePct)), HUNDRED))}) — indicative rate from the HTS, not expert-reviewed`,
        counted: true,
      });
      continue;
    }

    const outcome = evaluate(program.key, input.rows, ctx, exclusionState, nameOf);
    if (outcome.kind === "not_applicable") continue;

    const review = reviewOf.get(program.key);
    dutyReviews.push({
      programKey: program.key,
      name: program.name,
      status,
      reviewedAt: review?.reviewedAt ?? null,
      reviewedByName: review?.reviewedByName ?? null,
      staleReason: review ? staleReason(review, input.asOfDate) : null,
    });

    // Shown the same way whether the program is reviewed or pending.
    const suffix = status === "pending_review" ? "; pending expert review" : "";
    if (outcome.kind === "unconfirmed") {
      warnings.push({
        ...base,
        kind: "unconfirmed",
        text: `${program.warning_text} ${outcome.row.chapter99_heading} may apply, but its rate isn't confirmed: ${outcome.row.condition_text ?? outcome.row.label}.${outcome.notes.length > 0 ? ` ${outcome.notes.join(". ")}.` : ""}`,
        indicativePct: null,
        hint: `may apply under ${outcome.row.chapter99_heading}; rate unconfirmed, for expert review${suffix}`,
        counted: true,
      });
      continue;
    }
    if (outcome.kind === "conditional") {
      warnings.push({
        ...base,
        kind: "conditional",
        text: `${program.name} doesn't apply as entered, but: ${outcome.notes.join("; ")}.`,
        indicativePct: null,
        hint: null,
        counted: false,
      });
      continue;
    }

    if (status === "pending_review") {
      const pending = "pending expert review";
      if (outcome.kind === "exempt") {
        warnings.push({
          ...base,
          kind: "exempt_pending",
          text: `Appears exempt under ${outcome.heading} (${outcome.reason}), ${pending}.`,
          indicativePct: null,
          hint: `appears exempt (${outcome.heading}), ${pending}`,
          counted: false,
        });
      } else if (outcome.kind === "depends_on") {
        warnings.push({
          ...base,
          kind: "depends_on",
          text: `${program.warning_text} Exempt if ${outcome.programs.join(" or ")} applies (${outcome.heading}).`,
          indicativePct: null,
          hint: `exempt if ${outcome.programs.join(" or ")} applies (${outcome.heading}); ${pending}`,
          counted: true,
        });
      } else {
        const amount = centsToRational(outcome.cents);
        const share = div(mul(amount, HUNDRED), input.customsValueUsd);
        warnings.push({
          ...base,
          kind: "pending_review",
          text: `${program.warning_text} Duty data is loaded but ${pending}.`,
          indicativePct: Number(toFixed(share, 4)),
          hint:
            outcome.cents === BigInt(0)
              ? `would add nothing (${outcome.detail}); ${pending}`
              : `could add ${pct(share)} (about ${usd(amount)}, ${outcome.heading}); ${pending}`,
          counted: outcome.cents !== BigInt(0),
        });
      }
      continue;
    }

    // Reviewed: it counts.
    const row = outcome.kind === "charge" ? outcome.row : null;
    if (outcome.kind === "depends_on") {
      warnings.push({
        ...base,
        kind: "depends_on",
        text: `${program.name} is exempt if ${outcome.programs.join(" or ")} applies (${outcome.heading}), which isn't calculated yet.`,
        indicativePct: null,
        hint: `exempt if ${outcome.programs.join(" or ")} applies (${outcome.heading})`,
        counted: true,
      });
      continue;
    }
    if (outcome.kind === "exempt") {
      lines.push({
        kind: "additional",
        code: program.key,
        label: `${program.name}: exempt`,
        rateText: "Exempt",
        amountUsd: 0,
        detail: `${outcome.heading}: ${outcome.reason}`,
        sourceLabel: program.source_label,
        sourceUrl: program.source_url,
        effectiveFrom: null,
        heading: outcome.heading,
        notes: outcome.notes,
      });
      continue;
    }
    additionalCents += outcome.cents;
    lines.push({
      kind: "additional",
      code: program.key,
      label: `${program.name} (${row!.label})`,
      rateText:
        row!.rate_type === "minimum_total"
          ? `Minimum total ${pct(parseDecimal(row!.rate_pct ?? "0"), 4)}`
          : `+${pct(parseDecimal(row!.rate_pct ?? "0"), 4)}`,
      amountUsd: centsToNumber(outcome.cents),
      detail: outcome.detail,
      sourceLabel: row!.source_label,
      sourceUrl: row!.source_url,
      effectiveFrom: row!.effective_from,
      heading: outcome.heading,
      effectiveTo: row!.effective_to,
      legalStatus: LEGAL_STATUS_LABELS[row!.legal_status],
      sourceCheckedOn: row!.source_checked_on,
      notes: outcome.notes,
    });
  }

  return { lines, additionalDutiesUsd: centsToNumber(additionalCents), warnings, dutyReviews };
}

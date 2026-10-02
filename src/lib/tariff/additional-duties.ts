import { formatCurrency } from "@/lib/currency";
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

// Additional duties (Section 301 and others) on top of the base duty.
//
// Only rows of REVIEWED programs count toward the total. A pending program is
// evaluated the same way, but only to describe what it would add ("pending
// expert review — could add up to 12.5%"), and a program with no rows yet
// falls back to its indicative HTS rate. Rules, from U.S. notes 50 and 52:
//   - duties of different programs stack (note 52(a), 50(a)(i));
//   - a row doesn't apply when a program in its excludes_programs applies
//     (note 52(f), 50(a)(vi): Section 232 goods); if that program isn't
//     loaded yet but may apply, the row is named "exempt if … applies",
//     never charged or hinted with a percentage;
//   - minimum_total: column 1 rate + additional = at least the minimum, with
//     specific/compound rates read as duty / customs value (note 52(k));
//   - exemptions apply only when their scope matches without conditions;
//     conditional ones (a USMCA claim, a particular article within a
//     subheading) are shown as "may be exempt if …" and not applied.
// Pure: rows, reviews and the base duty are passed in.

export type ScopeLine = { hts_prefix: string; article_description: string | null };

export type DutyRow = {
  id: string;
  program_key: string;
  chapter99_heading: string;
  chapter99_heading_at_minimum: string | null;
  label: string;
  rate_type: "add" | "minimum_total" | "exempt";
  rate_pct: number | string | null;
  origin_countries: string[] | null;
  hts_scope: "all" | "listed";
  condition_text: string | null;
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

type Outcome =
  | { kind: "not_applicable" }
  | { kind: "exempt"; heading: string; reason: string }
  | { kind: "depends_on"; heading: string; programs: string[] }
  | {
      kind: "charge";
      row: DutyRow;
      heading: string;
      cents: bigint;
      detail: string;
      mayBeExempt: string[];
    };

const usd = (value: Rational) => formatCurrency(centsToNumber(toCents(value)), "USD");
const pct = (value: Rational, places = 2) => `${toFixed(value, places).replace(/\.?0+$/, "")}%`;
const HUNDRED = fromInteger(100);

function originMatches(row: DutyRow, origin: string): boolean {
  return row.origin_countries == null || row.origin_countries.includes(origin);
}

// The scope lines that cover this code ('all' scope: one line, no description).
function scopeMatches(row: DutyRow, htsCode: string): ScopeLine[] {
  if (row.hts_scope === "all") return [{ hts_prefix: "", article_description: null }];
  return row.scope.filter((s) => htsCode.startsWith(s.hts_prefix));
}

export function inForceOn(row: { effective_from: string; effective_to: string | null }, date: string): boolean {
  return row.effective_from <= date && (row.effective_to == null || row.effective_to >= date);
}

type ExclusionState = "applies" | "does_not_apply" | "unknown";

function evaluate(
  programKey: string,
  rows: DutyRow[],
  ctx: Context,
  exclusionState: (programKey: string) => ExclusionState,
  programName: (programKey: string) => string,
): Outcome {
  const mine = rows.filter((r) => r.program_key === programKey);
  const charging = mine
    .filter((r) => r.rate_type !== "exempt" && originMatches(r, ctx.originCountry))
    .filter((r) => scopeMatches(r, ctx.htsCode).length > 0)
    .sort((a, b) => a.filing_order - b.filing_order || a.chapter99_heading.localeCompare(b.chapter99_heading));
  const row = charging[0];
  if (!row) return { kind: "not_applicable" };

  // Exemptions: definite ones apply; conditional ones are listed.
  const mayBeExempt: string[] = [];
  for (const ex of mine.filter((r) => r.rate_type === "exempt" && originMatches(r, ctx.originCountry))) {
    const lines = scopeMatches(ex, ctx.htsCode);
    if (lines.length === 0) continue;
    const unconditional = !ex.condition_text && lines.some((l) => !l.article_description);
    if (unconditional) return { kind: "exempt", heading: ex.chapter99_heading, reason: ex.label };
    if (ex.condition_text) mayBeExempt.push(`${ex.chapter99_heading}: may be exempt if ${ex.condition_text}`);
    for (const l of lines.filter((x) => x.article_description)) {
      mayBeExempt.push(`${ex.chapter99_heading}: may be exempt if the article is: ${l.article_description}`);
    }
  }

  // Programs that exclude this one (e.g. Section 232 goods).
  const states = row.excludes_programs.map((key) => [key, exclusionState(key)] as const);
  const applying = states.find(([, s]) => s === "applies");
  if (applying) {
    return {
      kind: "exempt",
      heading: row.exclusion_heading ?? row.chapter99_heading,
      reason: `${programName(applying[0])} applies`,
    };
  }
  const unknown = states.filter(([, s]) => s === "unknown").map(([key]) => programName(key));
  if (unknown.length > 0) {
    return { kind: "depends_on", heading: row.exclusion_heading ?? row.chapter99_heading, programs: unknown };
  }

  const rate = parseDecimal(row.rate_pct ?? "0");
  if (row.rate_type === "add") {
    const amount = div(mul(ctx.customsValueUsd, rate), HUNDRED);
    return {
      kind: "charge",
      row,
      heading: row.chapter99_heading,
      cents: toCents(amount),
      detail: `${pct(rate, 4)} of ${usd(ctx.customsValueUsd)}`,
      mayBeExempt,
    };
  }

  // minimum_total (note 52(k)): top up the base duty to the minimum.
  const minimum = div(mul(ctx.customsValueUsd, rate), HUNDRED);
  const baseRate = div(mul(ctx.baseDutyUsd, HUNDRED), ctx.customsValueUsd);
  const topUp = sub(minimum, ctx.baseDutyUsd);
  if (topUp.n <= ZERO.n) {
    return {
      kind: "charge",
      row,
      heading: row.chapter99_heading_at_minimum ?? row.chapter99_heading,
      cents: toCents(ZERO),
      detail: `Base rate ${pct(baseRate)} already meets the ${pct(rate, 4)} minimum; nothing added`,
      mayBeExempt,
    };
  }
  return {
    kind: "charge",
    row,
    heading: row.chapter99_heading,
    cents: toCents(topUp),
    detail: `Minimum total ${pct(rate, 4)}: ${usd(minimum)} less base duty ${usd(ctx.baseDutyUsd)} (base rate ${pct(baseRate)})`,
    mayBeExempt,
  };
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

  // Whether a program that excludes another applies to this line. Reviewed
  // programs are evaluated; others "may apply" when their warning trigger
  // matches, which can't be settled yet.
  const exclusionState = (key: string, depth = 0): ExclusionState => {
    const program = programOf.get(key);
    if (!program || program.status === "inactive") return "does_not_apply";
    if (statusOf(key) === "reviewed" && depth < 2) {
      const outcome = evaluate(key, input.rows, ctx, (k) => exclusionState(k, depth + 1), nameOf);
      if (outcome.kind === "charge") return "applies";
      if (outcome.kind === "depends_on") return "unknown";
      return "does_not_apply";
    }
    return matchesProgramTrigger(program, input.originCountry, input.htsCode) ? "unknown" : "does_not_apply";
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
      notes: outcome.mayBeExempt,
    });
  }

  return { lines, additionalDutiesUsd: centsToNumber(additionalCents), warnings, dutyReviews };
}

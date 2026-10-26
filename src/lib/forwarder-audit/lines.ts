import {
  VALUE_ERROR,
  add,
  cat,
  cmpNum,
  countIfs,
  eq,
  isNum,
  matchIndex,
  ref,
  round,
  sub,
  trim,
  type Cell,
  type Input,
} from "./calc-semantics";
import { text, type CargoMeasures } from "./cargo";
import { BASES, BASIS, CATEGORIES, CATEGORY_NAMES, MAX_LINES, SERVICES, type AuditSettings } from "./lists";
import { textMoney } from "./text-format";
import type { AuditInputs, ChargeLineInputs, LineResult } from "./types";

// Each charge line, as the hidden Checks sheet works it out (columns B-Z).
// Every one of the 50 slots is calculated; an empty slot has no name.

export const EMPTY_LINE: ChargeLineInputs = {
  charge: "",
  category: "",
  basis: "",
  rate: null,
  currency: "",
  status: "",
  quantityOverride: null,
  minimumCharge: null,
  localTaxRate: null,
  forwarderLineTotal: null,
  agreedRate: null,
  reviewerFlag: "",
  note: "",
};

const is = (v: Input | Cell, s: string) => eq(v, s);
const oneOf = (v: Input | Cell, ...values: string[]) => values.some((s) => eq(v, s));

function exchangeRate(currency: number | string, inputs: AuditInputs): number | "" {
  const q = inputs.quotation;
  if (eq(currency, text(q.currency)) || eq(currency, "")) return 1;
  if (eq(currency, text(q.otherCurrency1)) && isNum(q.otherCurrency1Rate)) return q.otherCurrency1Rate;
  if (eq(currency, text(q.otherCurrency2)) && isNum(q.otherCurrency2Rate)) return q.otherCurrency2Rate;
  return "";
}

// CHOOSE(basis code, ...): the quantity a basis implies.
function basisQuantity(code: number, inputs: AuditInputs, m: CargoMeasures): Cell {
  if (code === 0) return "";
  if (code === BASIS.container) return inputs.quotation.containers ?? 1;
  if (code === BASIS.cbm) return m.cbm;
  if (code === BASIS.rt) return m.revenueTonnes;
  if (code === BASIS.kg) return m.chargeableKg;
  if (code === BASIS.percent) return "";
  if (code === BASIS.atCost) return 0;
  return 1;
}

type Draft = Omit<LineResult, "duplicate" | "questionKind">;

function verification(l: ChargeLineInputs, d: Omit<Draft, "check">, tolerance: number): Cell {
  const f = d.status;
  if (d.name === "") return "";
  if (oneOf(f, "At cost", "TBC")) return `Not priced (${f})`;
  if (oneOf(f, "Included", "Excluded", "Not applicable")) return f;
  if (f === "") return "Status missing";
  if (is(f, "If required") && !isNum(d.rate)) return "Not priced (if required)";
  if (d.basisCode === 0) return "Basis missing";
  if (d.basisCode === BASIS.atCost) return "Not priced (at cost)";
  if (!isNum(d.rate)) return "Rate missing";
  if (d.basisCode === BASIS.percent && !isNum(l.quantityOverride)) return "Base amount missing";
  if (!isNum(d.fx)) return "Exchange rate missing";
  if (!isNum(d.forwarderTotal)) return "Calculated — Not Independently Verified";
  // ABS("") when the line has no quantity (TECH_DEBT B2).
  if (!isNum(d.difference)) return VALUE_ERROR;
  if (cmpNum(Math.abs(d.difference), tolerance) <= 0) return "Verified";
  return `Error - differs by ${textMoney(d.difference)} ${cat(d.currency)}`;
}

function draftLine(l: ChargeLineInputs, index: number, inputs: AuditInputs, m: CargoMeasures, s: AuditSettings): Draft {
  const name = trim(l.charge);
  const category = l.category;
  const categoryIndex = matchIndex(text(category), CATEGORY_NAMES);
  const known = categoryIndex > 0 ? CATEGORIES[categoryIndex - 1] : null;
  const service = name === "" ? "" : category === "" ? "Other" : (known?.service ?? "Other");
  const group = name === "" ? "" : category === "" ? "Other" : (known?.group ?? "Other");
  const status = l.status;
  const basisCode = matchIndex(text(l.basis), BASES);
  const rate: number | "" = isNum(l.rate) ? l.rate : "";
  const currency: number | string = trim(l.currency) === "" ? ref(text(inputs.quotation.currency)) : trim(l.currency);
  const fx = exchangeRate(currency, inputs);
  const quantity: Cell = name === "" ? "" : isNum(l.quantityOverride) ? l.quantityOverride : basisQuantity(basisCode, inputs, m);
  const taxRate = isNum(l.localTaxRate) ? l.localTaxRate : 0;
  const priced =
    name !== "" && oneOf(status, "Firm", "Estimate", "If required") && isNum(rate) && basisCode > 0 && basisCode !== BASIS.atCost && isNum(quantity)
      ? 1
      : 0;
  let preTax: number | "" = "";
  let inclTax: number | "" = "";
  let total: number | "" = "";
  if (priced) {
    preTax = round(Math.max((rate as number) * (quantity as number), isNum(l.minimumCharge) ? l.minimumCharge : 0), 2);
    inclTax = round(preTax * add(1, taxRate), 2);
    total = isNum(fx) ? round(inclTax * fx, 2) : "";
  }
  const forwarderTotal: number | "" = isNum(l.forwarderLineTotal) ? l.forwarderLineTotal : "";
  let difference: number | "" = "";
  if (priced && isNum(forwarderTotal)) {
    const vsPreTax = sub(forwarderTotal, preTax as number);
    const vsInclTax = sub(forwarderTotal, inclTax as number);
    difference = cmpNum(Math.abs(vsPreTax), Math.abs(vsInclTax)) <= 0 ? vsPreTax : vsInclTax;
  }
  let agreedExcess = 0;
  if (priced && isNum(l.agreedRate) && isNum(fx)) {
    const over = sub(rate as number, l.agreedRate);
    // 0.005 is the workbook's own threshold, not the rounding tolerance (TECH_DEBT B8).
    agreedExcess = cmpNum(over, 0.005) > 0 ? round(over * (quantity as number) * add(1, taxRate) * fx, 2) : 0;
  }
  const serviceIndex = service === "" ? 0 : matchIndex(service, SERVICES);
  const inScope: Cell = service === "" ? "" : serviceIndex > 0 ? ref(text(inputs.services[serviceIndex - 1]?.requested ?? "")) : "";
  const unpriced = name !== "" && (oneOf(status, "At cost", "TBC") || (!is(status, "If required") && basisCode === BASIS.atCost)) ? 1 : 0;
  const firmPreTax = is(status, "Firm") && priced && isNum(fx) ? (preTax as number) * fx : 0;
  const draft = {
    line: index + 1,
    name,
    category,
    service,
    group,
    status,
    basisCode,
    rate,
    currency,
    fx,
    quantity,
    preTax,
    inclTax,
    total,
    priced: priced as 0 | 1,
    forwarderTotal,
    difference,
    agreedExcess,
    flag: l.reviewerFlag,
    inScope,
    unpriced: unpriced as 0 | 1,
    taxRate,
    firmPreTax,
  };
  return { ...draft, check: verification(l, draft, s.roundingTolerance) };
}

function questionKind(l: ChargeLineInputs, d: Draft, duplicate: number, inputs: AuditInputs): string {
  const f = d.status;
  if (d.name === "") return "";
  if (d.flag !== "") return "flag";
  if (f === "") return "status";
  if (d.basisCode === 0 && (oneOf(f, "Firm", "Estimate") || (is(f, "If required") && isNum(d.rate)))) return "basis";
  if (oneOf(f, "Firm", "Estimate") && d.basisCode !== BASIS.atCost && !isNum(d.rate)) return "rate";
  if (d.priced === 0 && d.basisCode === BASIS.percent && oneOf(f, "Firm", "Estimate") && isNum(d.rate)) return "base";
  if (d.category === "" || is(d.category, "Unclassified")) return "unclass";
  if (duplicate === 1) return "dup";
  if (is(text(inputs.shipment.rateAgreementProvided), "Yes") && d.priced === 1 && !isNum(l.agreedRate)) return "noagree";
  return "";
}

export function calculateLines(inputs: AuditInputs, m: CargoMeasures, s: AuditSettings): LineResult[] {
  const slots = Array.from({ length: MAX_LINES }, (_, i) => inputs.lines[i] ?? EMPTY_LINE);
  const drafts = slots.map((l, i) => draftLine(l, i, inputs, m, s));
  return drafts.map((d, i) => {
    // COUNTIFS(names, this name, services, this service): the name is a
    // criterion, so wildcards and operators in it count (TECH_DEBT B10).
    const duplicate =
      d.name === "" ? 0 : countIfs(MAX_LINES, [(j) => drafts[j].name, d.name], [(j) => drafts[j].service, d.service]) > 1 ? 1 : 0;
    return { ...d, duplicate, questionKind: questionKind(slots[i], d, duplicate, inputs) };
  });
}

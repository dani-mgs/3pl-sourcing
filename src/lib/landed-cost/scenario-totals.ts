import type { ShipmentMode } from "@/lib/tariff/calculate";
import type { EntryTypeChoice } from "@/lib/tariff/customs-fees";
import { fromInteger, mul, toCents, type Rational } from "@/lib/tariff/rational";
import { allocateCents } from "./allocation";
import { computeEntryFees, type EntryFees, type FeeRowWithDates } from "./entry-fees";
import { parseAmount, parseCents, parseWholeNumber, perUnit } from "./money";
import { allocateOtherCosts, parseOtherCosts, type OtherCost, type OtherCostInput } from "./other-costs";
import { componentBreakdown, type ComponentShare } from "./components";

// One origin scenario's landed cost: one customs entry, every SKU in it.
// Per SKU: product cost (qty × unit price, which is also its entered value),
// a share of the shipment's freight, its duties (calculated by the caller),
// shares of the entry's MPF and HMF and of the other costs, the line total
// and the cost per unit. USD only: amounts are converted upstream. Exact
// until each amount is rounded to the cent once; shares add up exactly.

// Terms where the unit price excludes international freight and insurance,
// so qty × price is the entered value. Delivered terms need the freight and
// insurance deduction first (later phase; docs/TECH_DEBT.md).
export const SUPPORTED_INCOTERMS: readonly string[] = ["EXW", "FCA", "FAS", "FOB"];

export const FREIGHT_BASES = ["chargeable_weight", "value", "units"] as const;
export type FreightBasis = (typeof FREIGHT_BASES)[number];

export type ScenarioSkuInput = {
  skuId: string;
  quantity: string;
  // Per unit, USD, up to 4 decimals.
  unitPriceUsd: string;
  // From shipment-measures; needed when freight is split by chargeable weight.
  chargeableKg: Rational | null;
  // Base plus additional duties for the line, USD (no fees: the entry's MPF
  // and HMF are worked out here).
  dutiesUsd: string;
  dutiesIncomplete: boolean;
  includesManualRate: boolean;
  unverified: boolean;
};

export type ScenarioInput = {
  incoterm: string;
  shipmentMode: ShipmentMode;
  entryTypeChoice: EntryTypeChoice;
  freightTotalUsd: string;
  freightBasis: FreightBasis;
  skus: ScenarioSkuInput[];
  otherCosts: OtherCostInput[];
  feeRows: FeeRowWithDates[];
  entryDate: string;
};

export type SkuTotals = {
  skuId: string;
  quantity: bigint;
  productCents: bigint;
  freightCents: bigint;
  dutiesCents: bigint;
  mpfCents: bigint;
  hmfCents: bigint;
  otherCents: bigint;
  totalCents: bigint;
  perUnitCents: bigint;
  perUnitExactCents: Rational;
};

export type ScenarioStatus = { incomplete: boolean; includesManualRate: boolean; unverified: boolean };

export type ScenarioTotals = {
  skus: SkuTotals[];
  units: bigint;
  totalCents: bigint;
  perUnitCents: bigint;
  components: ComponentShare[];
  entryFees: EntryFees;
  otherCosts: OtherCost[];
  status: ScenarioStatus;
};

export type ScenarioTotalsResult = { ok: true; totals: ScenarioTotals } | { ok: false; error: string };

type ParsedSku = { input: ScenarioSkuInput; quantity: bigint; productCents: bigint; dutiesCents: bigint };

function parseSku(sku: ScenarioSkuInput): ParsedSku | string {
  const quantity = parseWholeNumber(sku.quantity);
  if (quantity == null) return `${sku.skuId}: enter the quantity as a whole number above zero.`;
  const price = parseAmount(sku.unitPriceUsd, 4);
  if (price == null) return `${sku.skuId}: enter the unit price in USD as 0 or more, up to 4 decimals.`;
  const dutiesCents = parseCents(sku.dutiesUsd);
  if (dutiesCents == null) return `${sku.skuId}: the duties must be an amount in USD, 0 or more.`;
  return { input: sku, quantity, productCents: toCents(mul(price, fromInteger(quantity))), dutiesCents };
}

function freightWeights(skus: ParsedSku[], basis: FreightBasis): Rational[] | string {
  if (basis === "value") return skus.map((s) => fromInteger(s.productCents));
  if (basis === "units") return skus.map((s) => fromInteger(s.quantity));
  const missing = skus.find((s) => s.input.chargeableKg == null);
  if (missing) return `${missing.input.skuId} has no chargeable weight, so freight can't be split by weight.`;
  return skus.map((s) => s.input.chargeableKg!);
}

export function computeScenarioTotals(input: ScenarioInput): ScenarioTotalsResult {
  if (!SUPPORTED_INCOTERMS.includes(input.incoterm)) {
    return {
      ok: false,
      error: `${input.incoterm} isn't supported yet: its price includes freight or insurance, which must be deducted from the customs value. Use EXW, FCA, FAS or FOB.`,
    };
  }
  if (input.skus.length === 0) return { ok: false, error: "Add at least one SKU." };
  const skus: ParsedSku[] = [];
  for (const sku of input.skus) {
    const parsed = parseSku(sku);
    if (typeof parsed === "string") return { ok: false, error: parsed };
    skus.push(parsed);
  }
  const freightCents = parseCents(input.freightTotalUsd);
  if (freightCents == null) return { ok: false, error: "Enter the freight total in USD as 0 or more." };
  const other = parseOtherCosts(input.otherCosts);
  if (!other.ok) return other;

  const values = skus.map((s) => s.productCents);
  const fees = computeEntryFees({
    enteredValuesCents: values,
    shipmentMode: input.shipmentMode,
    feeRows: input.feeRows,
    entryDate: input.entryDate,
    entryTypeChoice: input.entryTypeChoice,
  });
  if (!fees.ok) return { ok: false, error: fees.error };
  const weights = freightWeights(skus, input.freightBasis);
  if (typeof weights === "string") return { ok: false, error: weights };
  const freight = allocateCents(freightCents, weights);
  if (!freight.ok) return freight;
  const otherShares = allocateOtherCosts(other.totalCents, values);
  if (!otherShares.ok) return otherShares;

  const lines: SkuTotals[] = skus.map((s, i) => {
    const mpfCents = fees.fees.mpfShares[i];
    const hmfCents = fees.fees.hmfShares[i];
    const totalCents =
      s.productCents + freight.parts[i] + s.dutiesCents + mpfCents + hmfCents + otherShares.parts[i];
    const unit = perUnit(totalCents, s.quantity);
    return {
      skuId: s.input.skuId,
      quantity: s.quantity,
      productCents: s.productCents,
      freightCents: freight.parts[i],
      dutiesCents: s.dutiesCents,
      mpfCents,
      hmfCents,
      otherCents: otherShares.parts[i],
      totalCents,
      perUnitCents: unit.cents,
      perUnitExactCents: unit.exact,
    };
  });

  const sum = (pick: (l: SkuTotals) => bigint) => lines.reduce((acc, l) => acc + pick(l), BigInt(0));
  const totalCents = sum((l) => l.totalCents);
  const units = sum((l) => l.quantity);
  return {
    ok: true,
    totals: {
      skus: lines,
      units,
      totalCents,
      perUnitCents: perUnit(totalCents, units).cents,
      components: componentBreakdown({
        fob: sum((l) => l.productCents),
        freight: sum((l) => l.freightCents),
        duties: sum((l) => l.dutiesCents),
        fees: sum((l) => l.mpfCents + l.hmfCents),
        other: sum((l) => l.otherCents),
      }),
      entryFees: fees.fees,
      otherCosts: other.lines,
      status: {
        // As isIncompleteEstimate: the fiscal year's MPF fees not entered counts too.
        incomplete: input.skus.some((s) => s.dutiesIncomplete) || fees.fees.warnings.length > 0,
        includesManualRate: input.skus.some((s) => s.includesManualRate),
        unverified: input.skus.some((s) => s.unverified),
      },
    },
  };
}

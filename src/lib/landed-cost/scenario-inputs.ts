import type { ShipmentMode } from "@/lib/tariff/calculate";
import { fromInteger, mul, toCents, toFixed, centsToRational } from "@/lib/tariff/rational";
import type { DutyLineRequest } from "./duty-request";
import { parseAmount, parseWholeNumber } from "./money";
import { AIR_CARGO_DIVISOR, SEA_KG_PER_CBM, measureSkuLine, type SkuMeasures } from "./shipment-measures";
import type { Scenario, ScenarioItem, SkuLine } from "./workspace-schema";

// For one scenario of a saved workspace: which inputs each SKU line still
// needs, its carton measures, and the line to ask the duty loader for. Pure.
//
// Required: the FOB price always; the packing (pieces per carton, carton
// L/W/H and weight) only when freight is split by chargeable weight; the
// scenario's freight total always. The duty quantity is required only when
// the loader says the rate is per unit (needs_quantity), so it's added later.

export const PACKING_FIELDS = [
  "pcs_per_carton",
  "carton_length_cm",
  "carton_width_cm",
  "carton_height_cm",
  "carton_gross_kg",
] as const;
export const ITEM_FIELDS = ["fob_unit_price_usd", ...PACKING_FIELDS] as const;

export type SkuField = (typeof ITEM_FIELDS)[number] | "duty_quantity";
export type ScenarioField = "freight_total_usd";

export type PreparedSku = {
  skuLine: SkuLine;
  // The duty loader's id for this scenario x SKU line.
  lineId: string;
  item: ScenarioItem | null;
  missing: SkuField[];
  // When the packing is all entered (whatever the freight basis).
  measures: SkuMeasures | null;
  // qty x FOB rounded half up to the cent: the product cost, and the entered
  // value the duty loader receives. Null without a FOB price.
  enteredValueUsd: string | null;
};

export type PreparedScenario = {
  scenario: Scenario;
  skus: PreparedSku[];
  missing: ScenarioField[];
  // A stored value the calculation refuses (the tables' bounds make this a
  // corrupted row, not a user error).
  error: string | null;
};

// A blank divisor means the mode's default: Air cargo 6,000, Sea 1,000; Road
// has none, so chargeable weight is the actual weight.
export function divisorFor(mode: ShipmentMode, divisor: string | null): string | null {
  if (divisor != null) return divisor;
  if (mode === "Air") return String(AIR_CARGO_DIVISOR);
  if (mode === "Sea") return String(SEA_KG_PER_CBM);
  return null;
}

const ITEM_KEYS: Record<(typeof ITEM_FIELDS)[number], keyof ScenarioItem> = {
  fob_unit_price_usd: "fobUnitPriceUsd",
  pcs_per_carton: "pcsPerCarton",
  carton_length_cm: "cartonLengthCm",
  carton_width_cm: "cartonWidthCm",
  carton_height_cm: "cartonHeightCm",
  carton_gross_kg: "cartonGrossKg",
};

const absent = (item: ScenarioItem | null, field: (typeof ITEM_FIELDS)[number]) => item == null || item[ITEM_KEYS[field]] == null;

export function prepareScenario(skuLines: SkuLine[], scenario: Scenario): PreparedScenario {
  const items = new Map(scenario.items.map((i) => [i.skuLineId, i]));
  const byWeight = scenario.freightBasis === "chargeable_weight";
  const divisor = divisorFor(scenario.shipmentMode, scenario.volumetricDivisor);
  let error: string | null = null;

  const skus = skuLines.map((skuLine): PreparedSku => {
    // A SKU line with no item row has none of its inputs: every field is missing.
    const item = items.get(skuLine.id) ?? null;
    const missing: SkuField[] = ITEM_FIELDS.filter(
      (f) => absent(item, f) && (f === "fob_unit_price_usd" || byWeight),
    );

    let measures: SkuMeasures | null = null;
    if (item && PACKING_FIELDS.every((f) => !absent(item, f))) {
      const measured = measureSkuLine(
        {
          quantity: skuLine.quantity,
          pcsPerCarton: item.pcsPerCarton!,
          lengthCm: item.cartonLengthCm!,
          widthCm: item.cartonWidthCm!,
          heightCm: item.cartonHeightCm!,
          cartonKg: item.cartonGrossKg!,
        },
        { mode: scenario.shipmentMode, divisor },
      );
      if (measured.ok) measures = measured.measures;
      else error ??= `${skuLine.skuCode}: ${measured.error}`;
    }

    let enteredValueUsd: string | null = null;
    if (item?.fobUnitPriceUsd != null) {
      const price = parseAmount(item.fobUnitPriceUsd, 4);
      const quantity = parseWholeNumber(skuLine.quantity);
      if (price && quantity) enteredValueUsd = toFixed(centsToRational(toCents(mul(price, fromInteger(quantity)))), 2);
      else error ??= `${skuLine.skuCode}: the stored quantity or FOB price can't be read.`;
    }

    return { skuLine, lineId: `${scenario.id}:${skuLine.id}`, item, missing, measures, enteredValueUsd };
  });

  return { scenario, skus, missing: scenario.freightTotalUsd == null ? ["freight_total_usd"] : [], error };
}

// The duty loader's request line for each SKU that has a FOB price (its
// duties are shown even while other inputs are missing).
export function dutyLines(prepared: PreparedScenario): DutyLineRequest[] {
  return prepared.skus.flatMap((s) =>
    s.enteredValueUsd == null
      ? []
      : [
          {
            lineId: s.lineId,
            htsCode: s.skuLine.htsCode,
            originCountry: prepared.scenario.originCountry,
            enteredValueUsd: s.enteredValueUsd,
            dutyQuantity: s.skuLine.dutyQuantity?.value ?? null,
            dutyQuantityUnit: s.skuLine.dutyQuantity?.unit ?? null,
          },
        ],
  );
}

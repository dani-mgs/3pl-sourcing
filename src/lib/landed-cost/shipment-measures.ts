import type { ShipmentMode } from "@/lib/tariff/calculate";
import { ZERO, add, compare, div, fromInteger, mul, type Rational } from "@/lib/tariff/rational";
import { parseMeasure, parseWholeNumber } from "./money";

// Cartons, volume and weights for each SKU line, and the chargeable weight
// freight is split by. Pure and exact (Rational).
//
// A divisor is in cm³ per kg: volumetric kg = carton cm³ × cartons ÷ divisor.
// Sea's 1 CBM = 1,000 kg is the divisor 1000 (1,000,000 cm³ ÷ 1,000 kg).
// A partial last carton counts as a full carton for weight and volume: the
// carton's dimensions and gross weight are all that's known about it.

export const AIR_CARGO_DIVISOR = 6000;
export const COURIER_DIVISOR = 5000;
export const SEA_KG_PER_CBM = 1000;

export type DivisorDefault = { key: string; label: string; mode: ShipmentMode; divisor: number | null };

// Defaults a scenario starts from; each scenario can change its divisor.
export const DIVISOR_DEFAULTS: readonly DivisorDefault[] = [
  { key: "air_cargo", label: "Air cargo (6,000 cm³/kg)", mode: "Air", divisor: AIR_CARGO_DIVISOR },
  { key: "courier", label: "Courier (5,000 cm³/kg)", mode: "Air", divisor: COURIER_DIVISOR },
  { key: "sea", label: "Sea (1 CBM = 1,000 kg)", mode: "Sea", divisor: SEA_KG_PER_CBM },
  { key: "road", label: "Road (no default: chargeable = actual weight)", mode: "Road", divisor: null },
];

export type SkuMeasuresInput = {
  quantity: string;
  pcsPerCarton: string;
  lengthCm: string;
  widthCm: string;
  heightCm: string;
  // Gross weight of one full carton.
  cartonKg: string;
};

export type SeaBasis = { revenueTons: Rational; basis: "weight" | "measure" };

export type SkuMeasures = {
  cartons: bigint;
  partialCarton: boolean;
  pcsInLastCarton: bigint;
  cartonCbm: Rational;
  totalCbm: Rational;
  actualKg: Rational;
  volumetricKg: Rational | null;
  chargeableKg: Rational;
  // Actual on a tie, or with no divisor.
  chargeableBasis: "actual" | "volumetric";
  // Sea only: freight is charged on whichever is larger, CBM or tonnes.
  seaBasis: SeaBasis | null;
};

export type MeasureResult = { ok: true; measures: SkuMeasures } | { ok: false; error: string };

const B0 = BigInt(0);
const B1 = BigInt(1);
const CM3_PER_CBM = fromInteger(1_000_000);
const KG_PER_TONNE = fromInteger(SEA_KG_PER_CBM);

// Carton sizes and weights, and the divisor: above zero, below 1,000,000,
// with at most 2 (cm) or 3 (kg, divisor) decimals. The workspace tables use
// the same bounds (migration 20261021013030).
export const CM_BOUNDS = { places: 2, max: 1_000_000 } as const;
export const KG_BOUNDS = { places: 3, max: 1_000_000 } as const;
export const DIVISOR_BOUNDS = { places: 3, max: 1_000_000 } as const;

export function seaBasis(totalCbm: Rational, actualKg: Rational): SeaBasis {
  const tonnes = div(actualKg, KG_PER_TONNE);
  return compare(totalCbm, tonnes) > 0
    ? { revenueTons: totalCbm, basis: "measure" }
    : { revenueTons: tonnes, basis: "weight" };
}

export function measureSkuLine(
  input: SkuMeasuresInput,
  options: { mode: ShipmentMode; divisor: string | null },
): MeasureResult {
  const quantity = parseWholeNumber(input.quantity);
  if (quantity == null) return { ok: false, error: "Enter the quantity as a whole number above zero." };
  const perCarton = parseWholeNumber(input.pcsPerCarton);
  if (perCarton == null) return { ok: false, error: "Enter the pieces per carton as a whole number above zero." };
  const dims = [input.lengthCm, input.widthCm, input.heightCm].map((d) => parseMeasure(d, CM_BOUNDS));
  if (dims.some((d) => d == null)) {
    return { ok: false, error: "Enter the carton length, width and height in cm, each above zero with up to 2 decimals." };
  }
  const cartonKg = parseMeasure(input.cartonKg, KG_BOUNDS);
  if (cartonKg == null) return { ok: false, error: "Enter the carton weight in kg, above zero with up to 3 decimals." };
  let divisor: Rational | null = null;
  if (options.divisor != null && options.divisor.trim() !== "") {
    divisor = parseMeasure(options.divisor, DIVISOR_BOUNDS);
    if (divisor == null) return { ok: false, error: "Enter the divisor as a number above zero with up to 3 decimals, or leave it blank." };
  }

  const cartons = (quantity + perCarton - B1) / perCarton;
  const pcsInLastCarton = quantity - (cartons - B1) * perCarton;
  const cartonCm3 = (dims as Rational[]).reduce((acc, d) => mul(acc, d));
  const count = fromInteger(cartons);
  const totalCm3 = mul(cartonCm3, count);
  const totalCbm = div(totalCm3, CM3_PER_CBM);
  const actualKg = mul(cartonKg, count);
  const volumetricKg = divisor ? div(totalCm3, divisor) : null;
  const volumetricApplies = volumetricKg != null && compare(volumetricKg, actualKg) > 0;

  return {
    ok: true,
    measures: {
      cartons,
      partialCarton: pcsInLastCarton !== perCarton,
      pcsInLastCarton,
      cartonCbm: div(cartonCm3, CM3_PER_CBM),
      totalCbm,
      actualKg,
      volumetricKg,
      chargeableKg: volumetricApplies ? volumetricKg : actualKg,
      chargeableBasis: volumetricApplies ? "volumetric" : "actual",
      seaBasis: options.mode === "Sea" ? seaBasis(totalCbm, actualKg) : null,
    },
  };
}

export type ShipmentTotals = {
  cartons: bigint;
  totalCbm: Rational;
  actualKg: Rational;
  volumetricKg: Rational | null;
  // Sum of the lines' chargeable weights (what freight is split by).
  chargeableKg: Rational;
};

export function shipmentTotals(lines: SkuMeasures[]): ShipmentTotals {
  const sum = (pick: (m: SkuMeasures) => Rational) => lines.reduce((acc, m) => add(acc, pick(m)), ZERO);
  // A scenario has one divisor, so either every line has a volumetric weight or none.
  const volumetric = lines.map((m) => m.volumetricKg);
  return {
    cartons: lines.reduce((acc, m) => acc + m.cartons, B0),
    totalCbm: sum((m) => m.totalCbm),
    actualKg: sum((m) => m.actualKg),
    volumetricKg: volumetric.every((v): v is Rational => v != null) && volumetric.length > 0
      ? volumetric.reduce((acc, v) => add(acc, v), ZERO)
      : null,
    chargeableKg: sum((m) => m.chargeableKg),
  };
}

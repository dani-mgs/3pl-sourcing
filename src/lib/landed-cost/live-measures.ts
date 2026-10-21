import type { ShipmentMode } from "@/lib/tariff/calculate";
import { toFixed, type Rational } from "@/lib/tariff/rational";
import type { SkuRow } from "./editor-draft";
import { divisorFor } from "./scenario-inputs";
import { measureSkuLine, shipmentTotals, type SkuMeasures } from "./shipment-measures";

// Cartons, CBM and weights shown live while packing is typed, from the same
// pure functions the server uses. Display only: the result panel's figures
// come from the server, on the last save. Pure.

export type MeasuresText = {
  cartons: string;
  // "Last carton holds 5 of 20 pcs"; null when every carton is full.
  partial: string | null;
  cbm: string;
  actualKg: string;
  volumetricKg: string | null;
  chargeableKg: string;
  chargeableBasis: "actual" | "volumetric";
};

const grouped = (digits: string) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

// Rounded half up for display, with thousands separators: 1234.5 → "1,234.5".
export function decimalText(value: Rational, places: number): string {
  const [whole, fraction] = toFixed(value, places).split(".");
  return fraction ? `${grouped(whole)}.${fraction}` : grouped(whole);
}

function text(m: SkuMeasures, pcsPerCarton: string): MeasuresText {
  return {
    cartons: grouped(m.cartons.toString()),
    partial: m.partialCarton ? `Last carton holds ${m.pcsInLastCarton} of ${pcsPerCarton} pcs` : null,
    cbm: decimalText(m.totalCbm, 3),
    actualKg: decimalText(m.actualKg, 1),
    volumetricKg: m.volumetricKg ? decimalText(m.volumetricKg, 1) : null,
    chargeableKg: decimalText(m.chargeableKg, 1),
    chargeableBasis: m.chargeableBasis,
  };
}

function measure(row: SkuRow, mode: ShipmentMode, divisor: string): SkuMeasures | null {
  const result = measureSkuLine(
    {
      quantity: row.quantity.replace(/,/g, ""),
      pcsPerCarton: row.pcsPerCarton.replace(/,/g, ""),
      lengthCm: row.cartonLengthCm,
      widthCm: row.cartonWidthCm,
      heightCm: row.cartonHeightCm,
      cartonKg: row.cartonGrossKg,
    },
    { mode, divisor: divisorFor(mode, divisor.trim() === "" ? null : divisor.trim()) },
  );
  return result.ok ? result.measures : null;
}

// Null until the quantity and every packing field hold valid values.
export function liveMeasures(row: SkuRow, mode: ShipmentMode, divisor: string): MeasuresText | null {
  const m = measure(row, mode, divisor);
  return m ? text(m, row.pcsPerCarton.trim()) : null;
}

// The shipment's totals, once every row can be measured; else null.
export function liveShipment(rows: SkuRow[], mode: ShipmentMode, divisor: string): Omit<MeasuresText, "partial" | "chargeableBasis"> | null {
  if (rows.length === 0) return null;
  const all = rows.map((r) => measure(r, mode, divisor));
  if (all.some((m) => m == null)) return null;
  const t = shipmentTotals(all as SkuMeasures[]);
  return {
    cartons: grouped(t.cartons.toString()),
    cbm: decimalText(t.totalCbm, 3),
    actualKg: decimalText(t.actualKg, 1),
    volumetricKg: t.volumetricKg ? decimalText(t.volumetricKg, 1) : null,
    chargeableKg: decimalText(t.chargeableKg, 1),
  };
}

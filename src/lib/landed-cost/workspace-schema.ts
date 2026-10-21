import { z } from "zod";

// The Landed Cost workspace tables (migration 20261021013030) as the app reads
// them. Inputs only: no amount is stored. Numeric columns are read as text
// (PostgREST `col::text`) so they stay exact decimal strings, the form
// Phase 1 and the duty loader parse. A row that doesn't match is reported as
// invalid data rather than half-read.

const uuid = z.uuid();
const decimal = z.string().regex(/^\d+(\.\d+)?$/);
const whole = z.string().regex(/^\d+$/);

export const WORKSPACE_COLUMNS = "id, owner_id, name, entry_date, currency, baseline_scenario_id, created_at, updated_at";
export const SKU_LINE_COLUMNS =
  "id, workspace_id, sku_code, description, hts_code, quantity::text, duty_quantity::text, duty_quantity_unit, sort_order";
export const SCENARIO_COLUMNS =
  "id, workspace_id, label, origin_country, supplier_name, incoterm, shipment_mode, entry_type, " +
  "freight_total_usd::text, freight_basis, volumetric_divisor::text, sort_order";
export const ITEM_COLUMNS =
  "workspace_id, scenario_id, sku_line_id, fob_unit_price_usd::text, pcs_per_carton::text, " +
  "carton_length_cm::text, carton_width_cm::text, carton_height_cm::text, carton_gross_kg::text";
export const OTHER_COST_COLUMNS = "id, workspace_id, scenario_id, label, amount_usd::text, sort_order";

export const workspaceRowSchema = z.object({
  id: uuid,
  owner_id: uuid,
  name: z.string(),
  entry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  currency: z.literal("USD"),
  baseline_scenario_id: uuid.nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const skuLineRowSchema = z.object({
  id: uuid,
  workspace_id: uuid,
  sku_code: z.string(),
  description: z.string().nullable(),
  hts_code: z.string().regex(/^(\d{8}|\d{10})$/),
  quantity: whole,
  duty_quantity: decimal.nullable(),
  duty_quantity_unit: z.string().nullable(),
  sort_order: z.number().int(),
});

export const scenarioRowSchema = z.object({
  id: uuid,
  workspace_id: uuid,
  label: z.string(),
  origin_country: z.string().regex(/^[A-Z]{2}$/),
  supplier_name: z.string().nullable(),
  incoterm: z.enum(["EXW", "FCA", "FAS", "FOB"]),
  shipment_mode: z.enum(["Air", "Sea", "Road"]),
  entry_type: z.enum(["auto", "formal"]),
  freight_total_usd: decimal.nullable(),
  freight_basis: z.enum(["chargeable_weight", "value", "units"]),
  volumetric_divisor: decimal.nullable(),
  sort_order: z.number().int(),
});

export const itemRowSchema = z.object({
  workspace_id: uuid,
  scenario_id: uuid,
  sku_line_id: uuid,
  fob_unit_price_usd: decimal.nullable(),
  pcs_per_carton: whole.nullable(),
  carton_length_cm: decimal.nullable(),
  carton_width_cm: decimal.nullable(),
  carton_height_cm: decimal.nullable(),
  carton_gross_kg: decimal.nullable(),
});

export const otherCostRowSchema = z.object({
  id: uuid,
  workspace_id: uuid,
  scenario_id: uuid,
  label: z.string(),
  amount_usd: decimal,
  sort_order: z.number().int(),
});

export type SkuLine = {
  id: string;
  skuCode: string;
  description: string | null;
  htsCode: string;
  quantity: string;
  dutyQuantity: { value: string; unit: string } | null;
};

// One scenario's inputs for one SKU line; null fields aren't entered yet.
export type ScenarioItem = {
  skuLineId: string;
  fobUnitPriceUsd: string | null;
  pcsPerCarton: string | null;
  cartonLengthCm: string | null;
  cartonWidthCm: string | null;
  cartonHeightCm: string | null;
  cartonGrossKg: string | null;
};

export type OtherCostLine = { id: string; label: string; amountUsd: string };

export type Scenario = {
  id: string;
  label: string;
  originCountry: string;
  supplierName: string | null;
  incoterm: "EXW" | "FCA" | "FAS" | "FOB";
  shipmentMode: "Air" | "Sea" | "Road";
  entryType: "auto" | "formal";
  freightTotalUsd: string | null;
  freightBasis: "chargeable_weight" | "value" | "units";
  volumetricDivisor: string | null;
  isBaseline: boolean;
  // In SKU line order; a SKU line without a row here has no inputs yet.
  items: ScenarioItem[];
  otherCosts: OtherCostLine[];
};

export type Workspace = {
  id: string;
  ownerId: string;
  name: string;
  entryDate: string;
  currency: "USD";
  baselineScenarioId: string | null;
  createdAt: string;
  updatedAt: string;
  skuLines: SkuLine[];
  scenarios: Scenario[];
};

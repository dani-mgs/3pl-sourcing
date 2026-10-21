import { z } from "zod";
import type { createClient } from "@/lib/supabase/server";
import {
  ITEM_COLUMNS,
  OTHER_COST_COLUMNS,
  SCENARIO_COLUMNS,
  SKU_LINE_COLUMNS,
  WORKSPACE_COLUMNS,
  itemRowSchema,
  otherCostRowSchema,
  scenarioRowSchema,
  skuLineRowSchema,
  workspaceRowSchema,
  type Workspace,
} from "./workspace-schema";

// SERVER-ONLY. Reads one Landed Cost workspace with its SKU lines, scenarios,
// per-scenario items and other costs, through the caller's client (RLS: any
// staff member reads; a client or anon gets nothing, which reads as not
// found). Five reads in parallel, each well under the API's 1,000 rows: the
// tables cap a workspace at 100 SKU lines x 5 scenarios and 20 other costs per
// scenario. Every row is parsed with Zod.

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type LoadWorkspaceResult =
  | { ok: true; workspace: Workspace }
  | { ok: false; code: "not_found" | "invalid_data" | "load_failed"; message: string };

const NOT_FOUND = "This workspace doesn't exist, or you can't open it.";

// Every row parsed, or null (logged) when one doesn't match.
function parseRows<T extends z.ZodType>(schema: T, rows: unknown[]): z.infer<T>[] | null {
  const out: z.infer<T>[] = [];
  for (const row of rows) {
    const result = schema.safeParse(row);
    if (!result.success) {
      console.error("loadWorkspace: unexpected row shape", result.error.issues.slice(0, 3));
      return null;
    }
    out.push(result.data);
  }
  return out;
}

const byOrder = (a: { sort_order: number; key: string }, b: { sort_order: number; key: string }) =>
  a.sort_order - b.sort_order || a.key.localeCompare(b.key);

export async function loadWorkspace(supabase: Supabase, workspaceId: string): Promise<LoadWorkspaceResult> {
  if (!z.uuid().safeParse(workspaceId).success) return { ok: false, code: "not_found", message: NOT_FOUND };
  try {
    const [workspace, skuLines, scenarios, items, otherCosts] = await Promise.all([
      supabase.from("landed_cost_workspaces").select(WORKSPACE_COLUMNS).eq("id", workspaceId).maybeSingle(),
      supabase.from("landed_cost_sku_lines").select(SKU_LINE_COLUMNS).eq("workspace_id", workspaceId),
      supabase.from("landed_cost_scenarios").select(SCENARIO_COLUMNS).eq("workspace_id", workspaceId),
      supabase.from("landed_cost_scenario_items").select(ITEM_COLUMNS).eq("workspace_id", workspaceId),
      supabase.from("landed_cost_other_costs").select(OTHER_COST_COLUMNS).eq("workspace_id", workspaceId),
    ]);
    for (const result of [workspace, skuLines, scenarios, items, otherCosts]) if (result.error) throw result.error;
    if (!workspace.data) return { ok: false, code: "not_found", message: NOT_FOUND };

    const w = workspaceRowSchema.safeParse(workspace.data);
    const lines = parseRows(skuLineRowSchema, skuLines.data ?? []);
    const scens = parseRows(scenarioRowSchema, scenarios.data ?? []);
    const its = parseRows(itemRowSchema, items.data ?? []);
    const costs = parseRows(otherCostRowSchema, otherCosts.data ?? []);
    if (!w.success || !lines || !scens || !its || !costs) {
      if (!w.success) console.error("loadWorkspace: unexpected workspace row", w.error.issues.slice(0, 3));
      return { ok: false, code: "invalid_data", message: "This workspace's data couldn't be read. Ask an admin to check it." };
    }

    const orderedLines = [...lines].sort((a, b) => byOrder({ ...a, key: a.sku_code }, { ...b, key: b.sku_code }));
    const lineOrder = new Map(orderedLines.map((l, i) => [l.id, i]));
    return {
      ok: true,
      workspace: {
        id: w.data.id,
        ownerId: w.data.owner_id,
        name: w.data.name,
        entryDate: w.data.entry_date,
        currency: w.data.currency,
        baselineScenarioId: w.data.baseline_scenario_id,
        createdAt: w.data.created_at,
        updatedAt: w.data.updated_at,
        skuLines: orderedLines.map((l) => ({
          id: l.id,
          skuCode: l.sku_code,
          description: l.description,
          htsCode: l.hts_code,
          quantity: l.quantity,
          dutyQuantity: l.duty_quantity != null && l.duty_quantity_unit != null ? { value: l.duty_quantity, unit: l.duty_quantity_unit } : null,
        })),
        scenarios: [...scens]
          .sort((a, b) => byOrder({ ...a, key: a.label }, { ...b, key: b.label }))
          .map((s) => ({
            id: s.id,
            label: s.label,
            originCountry: s.origin_country,
            supplierName: s.supplier_name,
            incoterm: s.incoterm,
            shipmentMode: s.shipment_mode,
            entryType: s.entry_type,
            freightTotalUsd: s.freight_total_usd,
            freightBasis: s.freight_basis,
            volumetricDivisor: s.volumetric_divisor,
            isBaseline: s.id === w.data.baseline_scenario_id,
            items: its
              .filter((i) => i.scenario_id === s.id)
              .sort((a, b) => (lineOrder.get(a.sku_line_id) ?? 0) - (lineOrder.get(b.sku_line_id) ?? 0))
              .map((i) => ({
                skuLineId: i.sku_line_id,
                fobUnitPriceUsd: i.fob_unit_price_usd,
                pcsPerCarton: i.pcs_per_carton,
                cartonLengthCm: i.carton_length_cm,
                cartonWidthCm: i.carton_width_cm,
                cartonHeightCm: i.carton_height_cm,
                cartonGrossKg: i.carton_gross_kg,
              })),
            otherCosts: costs
              .filter((c) => c.scenario_id === s.id)
              .sort((a, b) => byOrder({ ...a, key: a.label }, { ...b, key: b.label }))
              .map((c) => ({ id: c.id, label: c.label, amountUsd: c.amount_usd })),
          })),
      },
    };
  } catch (error) {
    // Details stay in the server log.
    console.error("loadWorkspace error:", error);
    return { ok: false, code: "load_failed", message: "The workspace couldn't be loaded right now. Try again." };
  }
}

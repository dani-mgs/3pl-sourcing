import type { createClient } from "@/lib/supabase/server";
import { todayUtc } from "@/lib/fx/server-rates";
import { centsToRational, compare, fromInteger, mul, parseDecimal, toCents, toFixed } from "@/lib/tariff/rational";
import type { DutyLineRequest } from "./duty-request";
import { BASE_LAYER } from "./manual-rates";
import { parseAmount, parseWholeNumber } from "./money";
import type { Draft, DraftIssue, DraftOverride, EngineRates } from "./parse-draft";
import { loadSkuDuties } from "./server-duty-batch";
import type { SkuDuty } from "./sku-duty";
import type { RateOverride, Workspace } from "./workspace-schema";

// SERVER-ONLY. For each manual rate that replaces a duty layer, the app's own
// rate and amount for that layer, stored with it so a later change of the
// app's rate can be shown (manual-rates.ts). Never from the browser.
//
// A replace that's unchanged since it was saved (same kind, layer and value;
// a new reason doesn't count) keeps what was stored, unless the user kept
// their rate after the app's changed ("Keep my rate", confirmAppRate). A new or changed one is
// worked out now, on the draft being saved (its HTS code, origin, entered
// value and entry date), in one batch for all of them; the save is refused
// when the line has no FOB price yet or the app doesn't apply that layer
// (it can be added as a manual duty instead). Uses the caller's client.

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type EngineRatesResult = { ok: true; rates: EngineRates } | { ok: false; error: string; issues: DraftIssue[] };

const sameValue = (a: string | null, b: string | null) =>
  a == null || b == null ? a === b : compare(parseDecimal(a), parseDecimal(b)) === 0;
const moneyText = (usd: number) => toFixed(centsToRational(BigInt(Math.round(usd * 100))), 2);

function unchanged(o: DraftOverride, stored: RateOverride | undefined): stored is RateOverride & { engineRateText: string; engineAmountUsd: string } {
  return (
    stored != null &&
    stored.kind === "replace" &&
    stored.layerKey === o.layerKey &&
    sameValue(stored.ratePercent, o.ratePercent) &&
    sameValue(stored.amountUsd, o.amountUsd) &&
    stored.engineRateText != null &&
    stored.engineAmountUsd != null
  );
}

function layerName(duty: SkuDuty | null, key: string): string {
  if (key === BASE_LAYER) return "the base duty";
  return duty?.dutyReviews.find((r) => r.programKey === key)?.name ?? duty?.warnings.find((w) => w.programKey === key)?.name ?? key;
}

export async function engineRatesFor(
  supabase: Supabase,
  draft: Draft,
  saved: Workspace | null,
  calculatedOn: string = todayUtc(),
): Promise<EngineRatesResult> {
  const stored = new Map(
    (saved?.scenarios ?? []).flatMap((s) => s.items.flatMap((i) => i.overrides.map((o) => [o.id, o] as const))),
  );
  const rates = new Map<DraftOverride, { rateText: string; amountUsd: string }>();
  const lines = new Map(draft.skuLines.map((l) => [l.ref, l]));
  const issues: DraftIssue[] = [];
  const requests: DutyLineRequest[] = [];
  const pending: { o: DraftOverride; lineId: string; path: string; where: string }[] = [];

  draft.scenarios.forEach((s, i) =>
    s.items.forEach((it, j) => {
      const line = lines.get(it.skuRef);
      if (!line) return;
      const where = `${line.skuCode} in ${s.label}`;
      const lineId = `${i}:${j}`;
      let requested = false;
      it.overrides.forEach((o, k) => {
        if (o.kind !== "replace") return;
        const before = o.id ? stored.get(o.id) : undefined;
        if (!o.confirmAppRate && unchanged(o, before)) {
          rates.set(o, { rateText: before.engineRateText, amountUsd: before.engineAmountUsd });
          return;
        }
        const price = it.fobUnitPriceUsd == null ? null : parseAmount(it.fobUnitPriceUsd, 4);
        const quantity = parseWholeNumber(line.quantity);
        if (price == null || quantity == null) {
          issues.push({ path: `scenarios.${i}.items.${j}.fobUnitPriceUsd`, message: `${where}: enter the FOB price before setting a manual rate.` });
          return;
        }
        if (!requested) {
          requests.push({
            lineId,
            htsCode: line.htsCode,
            originCountry: s.originCountry,
            enteredValueUsd: toFixed(centsToRational(toCents(mul(price, fromInteger(quantity)))), 2),
            dutyQuantity: line.dutyQuantity,
            dutyQuantityUnit: line.dutyQuantityUnit,
          });
          requested = true;
        }
        pending.push({ o, lineId, path: `scenarios.${i}.items.${j}.overrides.${k}.layerKey`, where });
      });
    }),
  );
  if (issues.length > 0) return { ok: false, error: issues[0].message, issues };
  if (pending.length > 0) {
    const batch = await loadSkuDuties(supabase, { entryDate: draft.entryDate, lines: requests }, calculatedOn);
    if (!batch.ok) return { ok: false, error: `The app's duties couldn't be worked out, so a manual rate can't be set yet: ${batch.message}`, issues: [] };
    const results = new Map(batch.lines.map((l) => [l.lineId, l]));
    for (const { o, lineId, path, where } of pending) {
      const result = results.get(lineId);
      if (!result?.ok) {
        const message = `${where}: the app's duties couldn't be worked out${result && !result.ok ? ` (${result.message})` : ""}, so a manual rate can't replace one.`;
        issues.push({ path, message });
        continue;
      }
      const key = o.layerKey!;
      const layer = result.duty.lines.find((l) => (key === BASE_LAYER ? l.kind === "duty" : l.kind === "additional" && l.code === key));
      if (!layer) {
        issues.push({
          path,
          message: `${where}: the app doesn't apply ${layerName(result.duty, key)}, so it can't be replaced. Add it as a manual duty instead.`,
        });
        continue;
      }
      rates.set(o, { rateText: layer.rateText, amountUsd: moneyText(layer.amountUsd) });
    }
    if (issues.length > 0) return { ok: false, error: issues[0].message, issues };
  }
  return { ok: true, rates: (o) => rates.get(o) ?? null };
}

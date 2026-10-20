import { fromInteger } from "@/lib/tariff/rational";
import { allocateCents } from "./allocation";
import { tenthsText } from "./money";

// The parts a landed cost is made of, in display order, and each part's share
// of the total. Shares are tenths of a percent split by largest remainder, so
// they always add up to exactly 100.0%.

export const COMPONENT_KEYS = ["fob", "freight", "duties", "fees", "other"] as const;
export type ComponentKey = (typeof COMPONENT_KEYS)[number];

export const COMPONENT_LABELS: Record<ComponentKey, string> = {
  fob: "Product cost (FOB)",
  freight: "Freight",
  duties: "Duties",
  fees: "MPF and HMF",
  other: "Other costs",
};

export type ComponentShare = { key: ComponentKey; label: string; cents: bigint; shareTenths: bigint; shareText: string };

const ONE_HUNDRED_PERCENT = BigInt(1000);

export function componentBreakdown(cents: Record<ComponentKey, bigint>): ComponentShare[] {
  const split = allocateCents(ONE_HUNDRED_PERCENT, COMPONENT_KEYS.map((k) => fromInteger(cents[k])));
  // A zero total (nothing to divide) shows every share as 0.0%.
  const tenths = split.ok ? split.parts : COMPONENT_KEYS.map(() => BigInt(0));
  return COMPONENT_KEYS.map((key, i) => ({
    key,
    label: COMPONENT_LABELS[key],
    cents: cents[key],
    shareTenths: tenths[i],
    shareText: tenthsText(tenths[i]),
  }));
}

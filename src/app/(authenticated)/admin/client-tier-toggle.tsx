"use client";

import { ConfirmActionButton } from "./confirm-action-button";
import { setClientTier } from "./client-actions";
import type { ClientTier } from "@/lib/admin/parse-admin-input";

// Admins switch a client between the free Move summary and the paid Market
// Report. Behind a confirmation, like the other permission changes.
export function ClientTierToggle({
  clientId,
  clientName,
  tier,
}: {
  clientId: string;
  clientName: string;
  tier: ClientTier;
}) {
  return tier === "market_report" ? (
    <ConfirmActionButton
      label="Move to free plan"
      title="Move to the free plan"
      description={`Move ${clientName} to the free plan? Their portal users will see the Move summary only, not the Market Report.`}
      confirmLabel="Move to free"
      onConfirm={() => setClientTier(clientId, "free")}
    />
  ) : (
    <ConfirmActionButton
      label="Give Market Report"
      title="Give the Market Report"
      description={`Give ${clientName} the paid Market Report? Their portal users will be able to open it once it ships.`}
      confirmLabel="Give Market Report"
      onConfirm={() => setClientTier(clientId, "market_report")}
    />
  );
}

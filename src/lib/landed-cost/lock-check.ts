import { missingItems } from "./result-view";
import type { ViewResult } from "./view-result";
import type { Workspace } from "./workspace-schema";

// Why a workspace can't be locked yet, in words, or null when it can: the
// result must be ready and every origin complete. Programs still pending
// review don't block (the version is marked incomplete). Pure.
export function lockBlocker(workspace: Workspace, result: ViewResult | null): string | null {
  if (!result || workspace.scenarios.length === 0) return "This workspace has no origin to lock.";
  if (result.state === "no_sku_lines") return "Add at least one SKU before locking.";
  if (result.state !== "ready") return result.message;
  const parts = result.scenarios.flatMap((o) => {
    if (o.state === "complete") return [];
    if (o.state === "error") return [`${o.label}: ${o.message}`];
    return [`${o.label}: ${missingItems(workspace, o).map((m) => m.label).join("; ")}`];
  });
  return parts.length > 0 ? `Complete every origin before locking: ${parts.join(". ")}.` : null;
}

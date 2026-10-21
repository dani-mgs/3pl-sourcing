// What to tell the user when a Landed Cost write fails in the database. The
// draft is checked before it's sent (parse-draft.ts), so these are mostly
// races and backstops. Only our own wording is returned: a database message
// is matched on, never shown. Pure.

export type DraftErrorCode = "stale" | "forbidden" | "not_found" | "invalid" | "failed";
export type DraftError = { code: DraftErrorCode; message: string };

type DbError = { code?: string | null; message?: string | null };

export const OWNER_ONLY = "Only the workspace's owner or an admin can edit it.";
export const NOT_FOUND = "This workspace doesn't exist, or you can't open it.";
export const STALE =
  "This workspace was changed by someone else since you opened it. Reload it to see their changes, then make yours again.";
const INVALID = "The draft couldn't be saved: it doesn't match the workspace any more. Reload it and try again.";
const FAILED = "The workspace couldn't be saved right now. Try again.";

// Our own trigger and constraint messages (migrations 20261021013030 and
// 20261021020238), matched by a fragment.
const CHECKS: [fragment: string, message: string][] = [
  ["at most 100 SKU lines", "A workspace can have at most 100 SKU lines."],
  ["at most 5 scenarios", "A workspace can have at most 5 scenarios."],
  ["at most 20 other costs", "A scenario can have at most 20 other costs."],
  ["Quantity x FOB price", "Quantity × FOB price must come to more than $0.00 and less than $100 trillion."],
  ["landed_cost_sku_lines_sku_code_unique", "Each SKU code can be used only once in a workspace."],
  ["landed_cost_scenarios_label_unique", "Each scenario needs its own label."],
];

export function draftError(error: DbError): DraftError {
  const text = error.message ?? "";
  switch (error.code) {
    case "LC409":
      return { code: "stale", message: STALE };
    case "42501":
      return { code: "forbidden", message: OWNER_ONLY };
    case "P0002":
      return { code: "not_found", message: NOT_FOUND };
    case "23505":
    case "23514": {
      const known = CHECKS.find(([fragment]) => text.includes(fragment));
      return { code: "invalid", message: known ? known[1] : "One of the values isn't accepted. Check the draft and try again." };
    }
    // Shape, a missing or mistyped value, or a row from elsewhere.
    case "LC422":
    case "22P02":
    case "23502":
    case "22007":
    case "22008":
    case "23503":
      return { code: "invalid", message: INVALID };
    default:
      return { code: "failed", message: FAILED };
  }
}

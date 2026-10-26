// Shared classes for the Forwarder Audit pages: the Landed Cost ones
// (docs/DESIGN_SYSTEM.md), so the two modules look alike.
export {
  cardClass,
  errorTextClass,
  fieldClass,
  hintClass,
  labelClass,
  linkButtonClass,
  primaryButtonClass,
  secondaryButtonClass,
  sectionTitleClass,
} from "../landed-cost/styles";

export const STATUS_CLASS: Record<string, string> = {
  "Audit Complete — No Issues Identified": "bg-move-green/10 text-move-green",
  "Corrections Required": "bg-red-50 text-danger",
  "Needs Clarification": "bg-amber-50 text-amber-800",
  "Insufficient Information": "bg-amber-50 text-amber-800",
  "Not started": "bg-neutral-bg text-neutral-muted",
};
export const TYPE_CLASS: Record<string, string> = {
  Error: "bg-red-50 text-danger",
  Question: "bg-amber-50 text-amber-800",
  Risk: "bg-sky-50 text-sky-800",
};

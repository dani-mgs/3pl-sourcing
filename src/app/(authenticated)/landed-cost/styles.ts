// Shared classes for the Landed Cost pages (docs/DESIGN_SYSTEM.md).
export { fieldClass, labelClass } from "../forwarder-sourcing/form-fields";

export const cardClass = "rounded-2xl border border-neutral-border bg-white p-6 shadow-sm";
export const sectionTitleClass = "font-display text-lg font-semibold text-move-navy";
export const hintClass = "text-xs text-neutral-muted";
export const primaryButtonClass =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-move-green px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-move-green-hover focus-visible:ring-2 focus-visible:ring-move-green focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60";
export const secondaryButtonClass =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-neutral-border bg-white px-4 py-2.5 text-sm font-medium text-move-navy hover:bg-neutral-bg focus-visible:ring-2 focus-visible:ring-move-green focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60";
// Small text buttons inside tables (add/remove a row, look up a code).
export const linkButtonClass =
  "rounded-md px-1 text-sm font-medium text-move-green underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-move-green focus-visible:outline-none disabled:cursor-not-allowed disabled:text-neutral-muted disabled:no-underline";
export const errorTextClass = "text-xs font-medium text-danger";

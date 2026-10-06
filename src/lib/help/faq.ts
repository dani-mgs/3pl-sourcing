import type { ReactNode } from "react";

// The Help FAQ: every item belongs to a module (and may name a page), the
// FAQ is shown under one heading per module in navigation order, and a chip
// filters it to one module. Pure functions, so the grouping is testable.

// The live modules in navigation order (src/lib/modules.ts; a test keeps them
// in step), then "General" for anything that applies across modules.
export const FAQ_MODULES = ["3PL Sourcing", "Forwarder Sourcing", "Tariff Calculator", "General"] as const;
export type FaqModule = (typeof FAQ_MODULES)[number];

export type FaqItem = {
  id: string;
  module: FaqModule;
  // The part of the module the question is about, e.g. "HTS lookup".
  page?: string;
  question: string;
  answer: ReactNode;
};

export type FaqFilter = "all" | FaqModule;

export type FaqGroup<T> = { module: FaqModule; items: T[] };

type Placed = { module: FaqModule };

// Modules that have at least one question, in navigation order. A module
// with none gets no chip and no heading.
export function faqModules(items: readonly Placed[]): FaqModule[] {
  return FAQ_MODULES.filter((module) => items.some((item) => item.module === module));
}

// Items grouped by module in navigation order (items keep their order inside
// a module), limited to one module when a filter is chosen.
export function groupFaq<T extends Placed>(items: readonly T[], filter: FaqFilter): FaqGroup<T>[] {
  return faqModules(items)
    .filter((module) => filter === "all" || module === filter)
    .map((module) => ({ module, items: items.filter((item) => item.module === module) }));
}

// "Tariff Calculator › HTS lookup"; null when the item names no page.
export function faqTag(item: { module: FaqModule; page?: string }): string | null {
  return item.page ? `${item.module} › ${item.page}` : null;
}

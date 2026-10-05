// Small helpers shared by the server pages and the client menus.

// The Tariff Calculator, pre-filled from the project (or one of its quotes).
export function estimateDutiesHref(projectId: string, quoteId?: string | null): string {
  return `/tariff-calculator?project=${projectId}${quoteId ? `&quote=${quoteId}` : ""}`;
}

// "1 duty estimate" / "3 duty estimates", for delete confirmations: linked
// estimates are deleted with their project, forwarder or quote.
export function dutyEstimatesLabel(count: number): string {
  return `${count} duty estimate${count === 1 ? "" : "s"}`;
}

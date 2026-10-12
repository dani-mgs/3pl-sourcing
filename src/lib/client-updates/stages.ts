// The client-facing stages (client dashboard plan, section 6): the same seven
// for both modules, so a client with several engagements learns one
// vocabulary. The expert picks the stage when publishing; it's never worked
// out from internal statuses.

export const CLIENT_STAGES = [
  { stage: 1, label: "Getting to know your needs", meaning: "Requirements, questions and kickoff." },
  { stage: 2, label: "Finding partners", meaning: "Contacting and screening partners." },
  { stage: 3, label: "Collecting quotes", meaning: "Waiting for quotes and checking them." },
  { stage: 4, label: "Comparing options", meaning: "Like-for-like comparison and negotiation." },
  { stage: 5, label: "Recommendation ready", meaning: "Waiting for your decision." },
  { stage: 6, label: "Setting up", meaning: "Contracting and onboarding the chosen partner." },
  { stage: 7, label: "Complete", meaning: "Done; kept for your records." },
] as const;

export type ClientStage = (typeof CLIENT_STAGES)[number]["stage"];

export function stageLabel(stage: number): string {
  return CLIENT_STAGES.find((s) => s.stage === stage)?.label ?? "In progress";
}

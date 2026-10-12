import { DRAFT_CANARY, demoClientUpdates } from "../../../../scripts/qa/demo-portal-data.mjs";
import type { PortalRow } from "../portal-data";
import { TODAY } from "./sources";

// What my_portal_updates() returns for a demo client, built from the demo
// seed's own updates (drafts are never returned by the SQL, so they're
// dropped here too; tests that need one add it on purpose).

type DemoUpdate = {
  engagement: string;
  daysAgo: number;
  isDraft?: boolean;
  stage: number;
  headline: string;
  summary: string;
  next_step: string | null;
  next_step_due: string | null;
  needs_client_action: boolean;
  payload: { kind: string };
};

export function isoDate(offset: number): string {
  const d = new Date(`${TODAY}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

const ALL = demoClientUpdates({ isoDate }) as DemoUpdate[];

export const CLIENT_ENGAGEMENTS: Record<string, string[]> = {
  northwind: ["northwind3pl"],
  brightline: ["brightlineFwd", "brightline3pl"],
  kettle: ["kettle3pl", "kettleFwd"],
  solace: ["solace3pl"],
  ridgeway: ["ridgewayFwd"],
  harbor: ["harbor3pl"],
};

export function rowsFor(client: string, { includeDraft = false } = {}): PortalRow[] {
  return ALL.filter((u) => CLIENT_ENGAGEMENTS[client].includes(u.engagement) && (includeDraft || !u.isDraft)).map((u) => ({
    engagement_key: `key-${u.engagement}`,
    project_kind: u.payload.kind,
    stage: u.stage,
    headline: u.headline,
    summary: u.summary,
    next_step: u.next_step,
    next_step_due: u.next_step_due,
    needs_client_action: u.needs_client_action,
    published_at: `${isoDate(-u.daysAgo)}T10:00:00Z`,
    payload: u.payload,
  }));
}

export { DRAFT_CANARY };

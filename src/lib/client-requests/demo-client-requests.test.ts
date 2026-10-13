import { describe, expect, test } from "vitest";
import { demoClientRequests, demoMarketReports, WITHDRAWN_CANARY } from "../../../scripts/qa/demo-portal-data.mjs";
import { MESSAGE_MAX } from "./text";

// The demo seed's client requests are written straight into the table (the
// seed has no client session), so this checks they're ones the database
// function and trigger would accept: kinds, lengths, statuses, call only on
// questions, introductions and interest, a reply only when answered, and the
// withdrawn text kept apart. Phase 3b: an introduction is a requestable letter
// of the latest demo report, and interest belongs to a free client.

type Demo = {
  engagement?: string;
  client?: string;
  label?: string;
  kind: "approve" | "request_changes" | "question" | "introduction" | "report_interest";
  message: string | null;
  wantsCall?: boolean;
  status: string;
  reply?: string;
  decidedOn?: string;
  withdrawn?: { reply: string };
};

const requests = demoClientRequests() as Demo[];

describe("demo seed client requests", () => {
  test("one in every state, from the mockup's examples", () => {
    expect(requests.map((r) => r.status).sort()).toEqual(["answered", "answered", "seen", "seen", "sent", "sent", "sent"]);
    expect(requests.map((r) => r.message)).toContain("Weekend delivery to Ontario?");
    expect(requests.map((r) => r.message)).toContain("Call me about contract length");
    expect(requests.some((r) => r.kind === "approve" && r.message)).toBe(true);
  });

  test.each(requests.map((r) => [`${r.engagement ?? r.client} ${r.kind}`, r] as const))("%s is something the database would accept", (_l, r) => {
    const max = MESSAGE_MAX[r.kind];
    if (r.kind === "question" || r.kind === "request_changes") expect(r.message?.length).toBeGreaterThan(0);
    expect((r.message ?? "").length).toBeLessThanOrEqual(max);
    if (r.kind === "approve" || r.kind === "request_changes") {
      expect(r.wantsCall ?? false).toBe(false);
      expect(r.decidedOn).toBeTruthy();
    }
    // Interest has no project; everything else has one.
    expect(r.kind === "report_interest").toBe(r.engagement === undefined && r.client !== undefined);
    expect(Boolean(r.reply)).toBe(r.status === "answered");
    if (r.reply) expect(r.reply.length).toBeLessThanOrEqual(MESSAGE_MAX.reply);
  });

  test("only the withdrawn reply carries the canary, and it isn't a current reply", () => {
    const withdrawn = requests.filter((r) => r.withdrawn);
    expect(withdrawn).toHaveLength(1);
    expect(withdrawn[0].withdrawn!.reply).toContain(WITHDRAWN_CANARY);
    expect(withdrawn[0].status).toBe("seen");
    expect(JSON.stringify(requests.map((r) => [r.message, r.reply]))).not.toContain(WITHDRAWN_CANARY);
  });
});

describe("demo seed introductions and interest (Phase 3b)", () => {
  test("Brightline's introduction is a requestable letter of its latest report, and names nobody", () => {
    const intro = requests.filter((r) => r.kind === "introduction");
    expect(intro).toHaveLength(1);
    const latest = (demoMarketReports() as { engagement: string; daysAgo: number; partners: { name: string; row: { label?: string; outcome: string } }[] }[])
      .filter((r) => r.engagement === intro[0].engagement)
      .sort((a, b) => a.daysAgo - b.daysAgo)[0];
    const row = latest.partners.find((p) => p.row.label === `Partner ${intro[0].label}`)!;
    expect(["quoted_not_selected", "quote_expired", "different_terms", "didnt_quote"]).toContain(row.row.outcome);
    // The forwarder behind the letter is never in the request's own text.
    expect(intro[0].message).not.toContain(row.name.split(" ")[0]);
  });

  test("interest comes from Ridgeway, a free client", () => {
    expect(requests.filter((r) => r.kind === "report_interest").map((r) => r.client)).toEqual(["ridgeway"]);
  });
});

import { describe, expect, test } from "vitest";
import { demoClientRequests, WITHDRAWN_CANARY } from "../../../scripts/qa/demo-portal-data.mjs";
import { MESSAGE_MAX } from "./text";

// The demo seed's client requests are written straight into the table (the
// seed has no client session), so this checks they're ones the database
// function and trigger would accept: kinds, lengths, statuses, call only on
// questions, a reply only when answered, and the withdrawn text kept apart.

type Demo = {
  engagement: string;
  kind: "approve" | "request_changes" | "question";
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
    expect(requests.map((r) => r.status).sort()).toEqual(["answered", "answered", "seen", "seen", "sent"]);
    expect(requests.map((r) => r.message)).toContain("Weekend delivery to Ontario?");
    expect(requests.map((r) => r.message)).toContain("Call me about contract length");
    expect(requests.some((r) => r.kind === "approve" && r.message)).toBe(true);
  });

  test.each(requests.map((r) => [`${r.engagement} ${r.kind}`, r] as const))("%s is something the database would accept", (_l, r) => {
    const max = r.kind === "question" ? MESSAGE_MAX.question : MESSAGE_MAX[r.kind];
    if (r.kind !== "approve") expect(r.message?.length).toBeGreaterThan(0);
    expect((r.message ?? "").length).toBeLessThanOrEqual(max);
    if (r.kind !== "question") {
      expect(r.wantsCall ?? false).toBe(false);
      expect(r.decidedOn).toBeTruthy();
    }
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

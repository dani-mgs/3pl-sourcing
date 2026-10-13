import { describe, expect, test } from "vitest";
import { canAct, inboxRows, parseInboxFilter, type InboxRow } from "./inbox";
import { parseRequestForm, replyInputSchema } from "./input";
import { decidedEngagementKeys, decisionOn, introductionsByLabel, reportInterest, toRequestViews, type RequestRow } from "./requests";
import * as TEXT from "./text";

// Runs in every QA timezone: dates here are ISO timestamps compared as
// strings; the portal shows them in the viewer's own timezone (LocalDate).

const KEY = "0123456789abcdef0123456789abcdef";
const UKEY = "fedcba9876543210fedcba9876543210";

function form(entries: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}

describe("request form", () => {
  test("approve: keys required, note optional (blank becomes none)", () => {
    expect(parseRequestForm(form({ kind: "approve", engagementKey: KEY, updateKey: UKEY, message: "  " }))).toEqual({
      kind: "approve",
      engagementKey: KEY,
      updateKey: UKEY,
      message: null,
    });
    expect(parseRequestForm(form({ kind: "approve", engagementKey: KEY, message: "" }))).toBeNull();
    expect(parseRequestForm(form({ kind: "approve", engagementKey: KEY, updateKey: UKEY, message: "x".repeat(501) }))).toBeNull();
  });

  test("request changes: a reason is required, up to 500 characters", () => {
    expect(parseRequestForm(form({ kind: "request_changes", engagementKey: KEY, updateKey: UKEY, message: " " }))).toBeNull();
    expect(parseRequestForm(form({ kind: "request_changes", engagementKey: KEY, updateKey: UKEY, message: "x".repeat(501) }))).toBeNull();
    expect(parseRequestForm(form({ kind: "request_changes", engagementKey: KEY, updateKey: UKEY, message: " West Coast option " }))).toMatchObject({
      message: "West Coast option",
    });
  });

  test("question: text required (up to 1,000), the call tick, no update key", () => {
    expect(parseRequestForm(form({ kind: "question", engagementKey: KEY, message: "Weekend delivery?", wantsCall: "on" }))).toEqual({
      kind: "question",
      engagementKey: KEY,
      message: "Weekend delivery?",
      wantsCall: true,
    });
    expect(parseRequestForm(form({ kind: "question", engagementKey: KEY, message: "x".repeat(1001) }))).toBeNull();
    expect(parseRequestForm(form({ kind: "question", engagementKey: KEY, message: "" }))).toBeNull();
  });

  test.each([
    [{ kind: "question", engagementKey: "not-a-key", message: "x" }],
    [{ kind: "question", engagementKey: "00000000-0000-4000-8000-000000000001", message: "x" }],
    [{ kind: "delete_everything", engagementKey: KEY, message: "x" }],
    [{ engagementKey: KEY, message: "x" }],
  ])("refuses %j", (entries) => {
    expect(parseRequestForm(form(entries as Record<string, string>))).toBeNull();
  });

  test("reply: a request id and 1-2,000 characters", () => {
    expect(replyInputSchema.safeParse({ requestId: "00000000-0000-4000-8000-000000000001", reply: " Yes " }).data?.reply).toBe("Yes");
    expect(replyInputSchema.safeParse({ requestId: "x", reply: "Yes" }).success).toBe(false);
    expect(replyInputSchema.safeParse({ requestId: "00000000-0000-4000-8000-000000000001", reply: "x".repeat(2001) }).success).toBe(false);
  });
});

describe("wording", () => {
  test("the approve dialog says proceed, records who and when, and promises nothing legal", () => {
    expect(TEXT.approveBody("Pacific Bridge Logistics")).toBe(
      "This tells Move to proceed with Pacific Bridge Logistics. Your name and the time will be recorded.",
    );
    const all = JSON.stringify(TEXT);
    expect(all).not.toMatch(/contract|agreement|binding|legal|guarantee/i);
  });

  test("every database error code has friendly text; staff see the reply warning", () => {
    expect(Object.keys(TEXT.REQUEST_ERRORS).sort()).toEqual(["CQ403", "CQ409", "CQ422", "CQ429"]);
    expect(TEXT.replyWarning("Brightline Apparel")).toContain("shown to Brightline Apparel in their portal");
    expect(TEXT.replyWarning("Brightline Apparel")).toContain("can't be edited");
  });

  test("the caps match the database", () => {
    expect(TEXT.MESSAGE_MAX).toEqual({ question: 1000, request_changes: 500, approve: 500, introduction: 500, report_interest: 500, reply: 2000 });
  });
});

function row(over: Partial<RequestRow>): RequestRow {
  return {
    request_key: "r",
    engagement_key: "e1",
    update_key: null,
    project_kind: "forwarder",
    kind: "question",
    message: "Hi",
    wants_call: false,
    status: "sent",
    created_at: "2026-10-10T10:00:00Z",
    from_first_name: "Maya",
    from_me: false,
    decision_name: null,
    reply: null,
    replied_at: null,
    replier_first_name: null,
    reply_withdrawn: false,
    partner_label: null,
    ...over,
  };
}

describe("requests in the portal", () => {
  test("newest first; you, a coworker's first name, or someone at your company; unknown rows left out", () => {
    const views = toRequestViews([
      row({ request_key: "old", created_at: "2026-10-01T10:00:00Z", from_me: true }),
      row({ request_key: "new", created_at: "2026-10-11T23:30:00Z" }),
      row({ request_key: "anon", created_at: "2026-10-05T10:00:00Z", from_first_name: null }),
      row({ request_key: "bad", kind: "refund" }),
      row({ request_key: "bad2", status: "closed" }),
    ]);
    expect(views.map((v) => [v.key, v.from])).toEqual([
      ["new", "Maya"],
      ["anon", "Someone at your company"],
      ["old", "You"],
    ]);
  });

  test("a decision counts only on the exact update; questions never do", () => {
    const views = toRequestViews([
      row({ kind: "approve", update_key: "u2" }),
      row({ request_key: "q", kind: "question", update_key: "u3" }),
    ]);
    expect(decisionOn(views, "u2")?.kind).toBe("approve");
    expect(decisionOn(views, "u3")).toBeNull();
    expect(decisionOn(views, null)).toBeNull();
    expect([...decidedEngagementKeys([{ key: "e1", latestUpdateKey: "u2" }, { key: "e2", latestUpdateKey: "u9" }], views)]).toEqual(["e1"]);
  });
});

function inbox(over: Partial<InboxRow>): InboxRow {
  return {
    id: "i",
    kind: "question",
    message: "Hi",
    wants_call: false,
    status: "sent",
    created_at: "2026-10-10T10:00:00Z",
    seen_at: null,
    staff_reply: null,
    replied_at: null,
    replied_by: null,
    created_by: null,
    reply_history: [],
    decision_snapshot: null,
    partner_label: null,
    client_id: "c1",
    three_pl_project_id: null,
    forwarder_project_id: "p1",
    projectOwnerId: "me",
    clientOwnerIds: [],
    projectLabel: "Freight forwarder project",
    clientName: "Brightline",
    ...over,
  };
}

describe("staff inbox", () => {
  test("defaults: experts see their own projects, admins everything; open requests", () => {
    expect(parseInboxFilter({}, false)).toEqual({ show: "mine", status: "open", project: null });
    expect(parseInboxFilter({}, true)).toEqual({ show: "all", status: "open", project: null });
    expect(parseInboxFilter({ show: "all", status: "answered", project: "not-an-id" }, false)).toEqual({ show: "all", status: "answered", project: null });
  });

  test("new first, then seen, then answered; newest first within each", () => {
    const rows = [
      inbox({ id: "answered", status: "answered" }),
      inbox({ id: "seen", status: "seen" }),
      inbox({ id: "sent-old", created_at: "2026-10-01T00:00:00Z" }),
      inbox({ id: "sent-new" }),
      inbox({ id: "other", projectOwnerId: "someone" }),
    ];
    expect(inboxRows(rows, { show: "all", status: "all", project: null }, "me").map((r) => r.id)).toEqual([
      "sent-new",
      "other",
      "sent-old",
      "seen",
      "answered",
    ]);
    expect(inboxRows(rows, { show: "mine", status: "open", project: null }, "me").map((r) => r.id)).toEqual(["sent-new", "sent-old", "seen"]);
    expect(inboxRows(rows, { show: "all", status: "open", project: "p2" }, "me")).toEqual([]);
  });

  test("only the project's owner or an admin acts", () => {
    const onProject = { three_pl_project_id: null, forwarder_project_id: "p1", clientOwnerIds: ["me"] };
    expect(canAct({ ...onProject, projectOwnerId: "me" }, "me", false)).toBe(true);
    expect(canAct({ ...onProject, projectOwnerId: "you" }, "me", false)).toBe(false);
    expect(canAct({ ...onProject, projectOwnerId: "you" }, "me", true)).toBe(true);
  });

  test("Market Report interest (no project): an admin or the owner of any of the client's projects", () => {
    const interest = { three_pl_project_id: null, forwarder_project_id: null, projectOwnerId: null };
    expect(canAct({ ...interest, clientOwnerIds: ["you", "me"] }, "me", false)).toBe(true);
    expect(canAct({ ...interest, clientOwnerIds: ["you"] }, "me", false)).toBe(false);
    expect(canAct({ ...interest, clientOwnerIds: [] }, "me", true)).toBe(true);
    const rows = [
      inbox({ id: "mine", kind: "report_interest", forwarder_project_id: null, projectOwnerId: null, clientOwnerIds: ["me"] }),
      inbox({ id: "theirs", kind: "report_interest", forwarder_project_id: null, projectOwnerId: null, clientOwnerIds: ["you"] }),
    ];
    expect(inboxRows(rows, { show: "mine", status: "open", project: null }, "me").map((r) => r.id)).toEqual(["mine"]);
  });
});

describe("introductions and Market Report interest (Phase 3b)", () => {
  test("introduction form: a project key and a bare letter; note and call optional", () => {
    expect(parseRequestForm(form({ kind: "introduction", engagementKey: KEY, label: "D", message: " ", wantsCall: "on" }))).toEqual({
      kind: "introduction",
      engagementKey: KEY,
      label: "D",
      message: null,
      wantsCall: true,
    });
    expect(parseRequestForm(form({ kind: "introduction", engagementKey: KEY, label: "AB", message: "Hi" }))).toMatchObject({ label: "AB", wantsCall: false });
  });

  test.each([
    [{ kind: "introduction", engagementKey: KEY, label: "Partner D", message: "" }],
    [{ kind: "introduction", engagementKey: KEY, label: "d", message: "" }],
    [{ kind: "introduction", engagementKey: KEY, label: "ABC", message: "" }],
    [{ kind: "introduction", engagementKey: KEY, label: "Meridian Ocean Logistics", message: "" }],
    [{ kind: "introduction", engagementKey: KEY, message: "" }],
    [{ kind: "introduction", engagementKey: "x", label: "D", message: "" }],
    [{ kind: "introduction", engagementKey: KEY, label: "D", message: "x".repeat(501) }],
    [{ kind: "report_interest", message: "x".repeat(501) }],
  ])("refuses %j", (entries) => {
    expect(parseRequestForm(form(entries as Record<string, string>))).toBeNull();
  });

  test("interest form: no project, no key; note and call optional", () => {
    expect(parseRequestForm(form({ kind: "report_interest", engagementKey: KEY, message: "  Tell me more  " }))).toEqual({
      kind: "report_interest",
      message: "Tell me more",
      wantsCall: false,
    });
  });

  test("the introduction and unlock wording promises nothing and names no price or fee", () => {
    const words = [
      TEXT.introductionTitle("Partner D"),
      TEXT.introductionBody("Partner D"),
      TEXT.INTRODUCTION_NOTE_LABEL,
      TEXT.INTRODUCTION_NOTE_HINT,
      TEXT.INTRODUCTION_CONFIRM,
      TEXT.UNLOCK_TITLE,
      TEXT.UNLOCK_BODY,
      TEXT.UNLOCK_NOTE_LABEL,
      TEXT.UNLOCK_CONFIRM,
      TEXT.UNLOCK_ASKED,
      TEXT.ACTION_LABELS.requestIntroduction,
      TEXT.ACTION_LABELS.introductionRequested,
      TEXT.ACTION_LABELS.unlockReport,
      TEXT.SENT_OK.introduction,
      TEXT.SENT_OK.report_interest,
    ].join(" | ");
    expect(words).not.toMatch(/\$|€|£|\d|fee|price|cost|charge|pay|discount|free/i);
    expect(TEXT.introductionBody("Partner D")).toBe(
      "Move will put you in touch with Partner D and contact you about next steps. Your name and the time will be recorded.",
    );
    expect(TEXT.MESSAGE_MAX.introduction).toBe(500);
    expect(TEXT.MESSAGE_MAX.report_interest).toBe(500);
  });

  test("staff: the introduction warnings name the letter, and the partner only in the staff-only error", () => {
    expect(TEXT.introductionReplyWarning("Partner D")).toContain("only knows this partner as Partner D");
    expect(TEXT.introductionReplyIdentifies("Meridian Ocean Logistics", "meridian", "Partner D")).toContain('Meridian Ocean Logistics ("meridian")');
    expect(TEXT.STAFF_REPLY_ERRORS.CQ423).toMatch(/names the partner/);
  });

  test("an introduction shows its letter; interest has no project; rows missing either are left out", () => {
    const views = toRequestViews([
      row({ request_key: "i", kind: "introduction", partner_label: "D", created_at: "2026-10-11T00:00:00Z" }),
      row({ request_key: "u", kind: "report_interest", engagement_key: null, project_kind: null, created_at: "2026-10-10T00:00:00Z" }),
      row({ request_key: "no-letter", kind: "introduction", partner_label: null }),
      row({ request_key: "bad-letter", kind: "introduction", partner_label: "Meridian" }),
      row({ request_key: "3pl-intro", kind: "introduction", partner_label: "D", project_kind: "three_pl" }),
      row({ request_key: "interest-with-project", kind: "report_interest" }),
      row({ request_key: "question-without-project", engagement_key: null, project_kind: null }),
    ]);
    expect(views.map((v) => [v.key, v.partnerLabel])).toEqual([
      ["i", "Partner D"],
      ["u", null],
    ]);
    expect(reportInterest(views)?.key).toBe("u");
    expect(decisionOn(views, null)).toBeNull();
  });

  test("per letter: the open request wins over an answered one; other projects don't count", () => {
    const views = toRequestViews([
      row({ request_key: "new-open", kind: "introduction", partner_label: "D", status: "sent", created_at: "2026-10-12T00:00:00Z" }),
      row({ request_key: "old-answered", kind: "introduction", partner_label: "D", status: "answered", created_at: "2026-10-01T00:00:00Z" }),
      row({ request_key: "e-answered", kind: "introduction", partner_label: "E", status: "answered" }),
      row({ request_key: "other", kind: "introduction", partner_label: "F", engagement_key: "e2" }),
    ]);
    const byLabel = introductionsByLabel(views, "e1");
    expect([...byLabel].map(([l, v]) => [l, v.key])).toEqual([
      ["Partner D", "new-open"],
      ["Partner E", "e-answered"],
    ]);
  });
});

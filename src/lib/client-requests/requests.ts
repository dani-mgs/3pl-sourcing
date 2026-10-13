// What my_client_requests() / client_requests_for_client() return, turned
// into what the portal shows. Pure. No ids: requests, projects and updates
// are opaque keys.

export type RequestRow = {
  request_key: string;
  engagement_key: string;
  update_key: string | null;
  project_kind: string;
  kind: string;
  message: string | null;
  wants_call: boolean;
  status: string;
  created_at: string;
  from_first_name: string | null;
  from_me: boolean;
  decision_name: string | null;
  reply: string | null;
  replied_at: string | null;
  replier_first_name: string | null;
  reply_withdrawn: boolean;
};

export type RequestKind = "approve" | "request_changes" | "question";
export type RequestStatus = "sent" | "seen" | "answered";

export type ClientRequestView = {
  key: string;
  engagementKey: string;
  updateKey: string | null;
  projectKind: "forwarder" | "three_pl";
  kind: RequestKind;
  message: string | null;
  wantsCall: boolean;
  status: RequestStatus;
  createdAt: string;
  // "You", a coworker's first name, or "Someone at your company".
  from: string;
  decisionName: string | null;
  reply: string | null;
  repliedAt: string | null;
  replier: string | null;
  replyWithdrawn: boolean;
};

const KINDS = new Set(["approve", "request_changes", "question"]);
const STATUSES = new Set(["sent", "seen", "answered"]);

// Rows that don't read (an unknown kind or status) are left out.
export function toRequestViews(rows: RequestRow[]): ClientRequestView[] {
  return rows
    .filter((r) => KINDS.has(r.kind) && STATUSES.has(r.status) && (r.project_kind === "forwarder" || r.project_kind === "three_pl"))
    .map((r) => ({
      key: r.request_key,
      engagementKey: r.engagement_key,
      updateKey: r.update_key,
      projectKind: r.project_kind as ClientRequestView["projectKind"],
      kind: r.kind as RequestKind,
      message: r.message,
      wantsCall: r.wants_call,
      status: r.status as RequestStatus,
      createdAt: r.created_at,
      from: r.from_me ? "You" : (r.from_first_name ?? "Someone at your company"),
      decisionName: r.decision_name,
      reply: r.reply,
      repliedAt: r.replied_at,
      replier: r.replier_first_name,
      replyWithdrawn: r.reply_withdrawn,
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// The decision (approve or request changes) made on this exact update, if any.
export function decisionOn(requests: ClientRequestView[], updateKey: string | null): ClientRequestView | null {
  if (!updateKey) return null;
  return requests.find((r) => r.kind !== "question" && r.updateKey === updateKey) ?? null;
}

// Projects whose latest update someone at the client has already decided on:
// they no longer "need you" (until the next update).
export function decidedEngagementKeys(
  engagements: { key: string; latestUpdateKey: string | null }[],
  requests: ClientRequestView[],
): Set<string> {
  return new Set(engagements.filter((e) => decisionOn(requests, e.latestUpdateKey) != null).map((e) => e.key));
}

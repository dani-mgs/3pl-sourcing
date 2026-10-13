// What my_client_requests() / client_requests_for_client() return, turned
// into what the portal shows. Pure. No ids: requests, projects and updates
// are opaque keys, and a partner is its letter.

export type RequestRow = {
  request_key: string;
  // Null for Market Report interest (not tied to a project).
  engagement_key: string | null;
  update_key: string | null;
  project_kind: string | null;
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
  // Introductions: the letter ("D").
  partner_label: string | null;
};

export type RequestKind = "approve" | "request_changes" | "question" | "introduction" | "report_interest";
export type RequestStatus = "sent" | "seen" | "answered";

export type ClientRequestView = {
  key: string;
  engagementKey: string | null;
  updateKey: string | null;
  projectKind: "forwarder" | "three_pl" | null;
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
  // "Partner D" (introductions only).
  partnerLabel: string | null;
};

const KINDS = new Set(["approve", "request_changes", "question", "introduction", "report_interest"]);
const STATUSES = new Set(["sent", "seen", "answered"]);
const LETTER = /^[A-Z]{1,2}$/;

function readable(r: RequestRow): boolean {
  if (!KINDS.has(r.kind) || !STATUSES.has(r.status)) return false;
  if (r.kind === "report_interest") return r.engagement_key == null;
  if (r.kind === "introduction" && !(r.project_kind === "forwarder" && LETTER.test(r.partner_label ?? ""))) return false;
  return r.engagement_key != null && (r.project_kind === "forwarder" || r.project_kind === "three_pl");
}

// Rows that don't read (an unknown kind or status, a missing project or
// letter) are left out.
export function toRequestViews(rows: RequestRow[]): ClientRequestView[] {
  return rows
    .filter(readable)
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
      partnerLabel: r.kind === "introduction" ? `Partner ${r.partner_label}` : null,
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// The decision (approve or request changes) made on this exact update, if any.
export function decisionOn(requests: ClientRequestView[], updateKey: string | null): ClientRequestView | null {
  if (!updateKey) return null;
  return requests.find((r) => (r.kind === "approve" || r.kind === "request_changes") && r.updateKey === updateKey) ?? null;
}

// Projects whose latest update someone at the client has already decided on:
// they no longer "need you" (until the next update).
export function decidedEngagementKeys(
  engagements: { key: string; latestUpdateKey: string | null }[],
  requests: ClientRequestView[],
): Set<string> {
  return new Set(engagements.filter((e) => decisionOn(requests, e.latestUpdateKey) != null).map((e) => e.key));
}

// The introduction requests on one project's report, by letter ("Partner D"):
// the open one if there is one, else the latest (requests are newest first).
export function introductionsByLabel(requests: ClientRequestView[], engagementKey: string): Map<string, ClientRequestView> {
  const byLabel = new Map<string, ClientRequestView>();
  for (const r of requests) {
    if (r.kind !== "introduction" || r.engagementKey !== engagementKey || !r.partnerLabel) continue;
    const seen = byLabel.get(r.partnerLabel);
    if (!seen || (seen.status === "answered" && r.status !== "answered")) byLabel.set(r.partnerLabel, r);
  }
  return byLabel;
}

// The client's "Unlock the Market Report" request, if it sent one.
export function reportInterest(requests: ClientRequestView[]): ClientRequestView | null {
  return requests.find((r) => r.kind === "report_interest") ?? null;
}

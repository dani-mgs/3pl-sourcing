// The staff "Client requests" inbox: which requests to list, in what order,
// and what the viewer may do with each. Pure; the page reads the rows (RLS:
// staff read every request).

export type InboxRow = {
  id: string;
  kind: "approve" | "request_changes" | "question" | "introduction" | "report_interest";
  message: string | null;
  wants_call: boolean;
  status: "sent" | "seen" | "answered";
  created_at: string;
  seen_at: string | null;
  staff_reply: string | null;
  replied_at: string | null;
  replied_by: string | null;
  created_by: string | null;
  reply_history: { reply?: string; repliedBy?: string; repliedAt?: string; withdrawnBy?: string; withdrawnAt?: string }[];
  decision_snapshot: {
    recommendation?: { name?: string } | null;
    headline?: string;
    publishedAt?: string;
    reportPublishedAt?: string;
    partner?: { label?: string; priceUsd?: number | null; leadMinDays?: number | null; leadMaxDays?: number | null } | null;
  } | null;
  partner_label: string | null;
  client_id: string;
  three_pl_project_id: string | null;
  forwarder_project_id: string | null;
  projectOwnerId: string | null;
  // Requests without a project (Market Report interest): the owners of any
  // of that client's projects may act, like the database's
  // can_act_on_client_request().
  clientOwnerIds: string[];
  projectLabel: string;
  clientName: string;
};

export type InboxFilter = {
  show: "mine" | "all";
  status: "open" | "answered" | "all";
  project: string | null;
};

export function parseInboxFilter(params: Record<string, string | string[] | undefined>, isAdmin: boolean): InboxFilter {
  const one = (k: string) => (typeof params[k] === "string" ? (params[k] as string) : undefined);
  const show = one("show");
  const status = one("status");
  const project = one("project");
  return {
    // Admins see everything by default; experts their own projects.
    show: show === "mine" || show === "all" ? show : isAdmin ? "all" : "mine",
    status: status === "answered" || status === "all" ? status : "open",
    project: project && /^[0-9a-f-]{36}$/i.test(project) ? project : null,
  };
}

const STATUS_ORDER = { sent: 0, seen: 1, answered: 2 } as const;

function isMine(r: Pick<InboxRow, "projectOwnerId" | "clientOwnerIds" | "three_pl_project_id" | "forwarder_project_id">, me: string) {
  return r.three_pl_project_id == null && r.forwarder_project_id == null ? r.clientOwnerIds.includes(me) : r.projectOwnerId === me;
}

export function inboxRows(rows: InboxRow[], filter: InboxFilter, me: string): InboxRow[] {
  return rows
    .filter((r) => filter.show === "all" || isMine(r, me))
    .filter((r) => (filter.status === "all" ? true : filter.status === "open" ? r.status !== "answered" : r.status === "answered"))
    .filter((r) => !filter.project || r.three_pl_project_id === filter.project || r.forwarder_project_id === filter.project)
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || b.created_at.localeCompare(a.created_at));
}

// Owner or admin: mark seen and reply (for Market Report interest, the owner
// of any of the client's projects). Admins: withdraw a reply.
export function canAct(
  row: Pick<InboxRow, "projectOwnerId" | "clientOwnerIds" | "three_pl_project_id" | "forwarder_project_id">,
  me: string,
  isAdmin: boolean,
): boolean {
  return isAdmin || isMine(row, me);
}

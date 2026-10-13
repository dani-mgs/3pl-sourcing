import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/auth/require-staff";
import { embeddedOne } from "@/lib/clients";
import { canAct, inboxRows, parseInboxFilter, type InboxFilter, type InboxRow } from "@/lib/client-requests/inbox";
import { kindLabel } from "@/lib/client-updates/portal-text";
import { projectPath } from "@/lib/client-updates/share-paths";
import { shortRouteLabel } from "@/lib/forwarder/project-display";
import { usd } from "@/lib/client-updates/portal-text";
import { RequestItem, type RequestItemView } from "./request-item";

// "Client requests": approvals, change requests, questions, introduction
// requests and Market Report interest from client users. Staff only (layout
// and RLS). Opening a request marks it seen only for those who can act on
// it, by an explicit action. An introduction's letter is resolved to the
// forwarder here, through the staff-only labels table: staff see the name,
// the client never does.

type Row = Record<string, unknown>;

const KIND = {
  approve: "Approval",
  request_changes: "Change request",
  question: "Question",
  introduction: "Introduction",
  report_interest: "Market Report interest",
} as const;

function firstWord(name: unknown): string | null {
  const w = typeof name === "string" ? name.trim().split(/\s+/)[0] : "";
  return w ? w : null;
}

// What the client asked for, with the staff-only name. The snapshot is the
// row the client saw when it asked.
function introductionDetail(letter: string, resolved: string, snapshot: InboxRow["decision_snapshot"]): string {
  const p = snapshot?.partner;
  const price = typeof p?.priceUsd === "number" ? `quoted ${usd(p.priceUsd)} per shipment` : "no quote";
  const lead = typeof p?.leadMinDays === "number" && typeof p?.leadMaxDays === "number" ? `, ${p.leadMinDays}–${p.leadMaxDays} days` : "";
  return `Asked for an introduction to ${letter} in their Market Report (${price}${lead}). Staff only: ${letter} is ${resolved}. The client doesn't know the name.`;
}

export default async function ClientRequestsPage({ searchParams }: PageProps<"/client-requests">) {
  const role = await requireStaff();
  const isAdmin = role === "admin";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const me = user?.id ?? "";
  const filter = parseInboxFilter(await searchParams, isAdmin);

  const { data } = await supabase
    .from("client_requests")
    .select(
      "id, kind, message, wants_call, status, created_at, seen_at, staff_reply, replied_at, replied_by, created_by, reply_history, decision_snapshot, partner_label, client_id, three_pl_project_id, forwarder_project_id, clients(name), three_pl_projects(owner_id, target_geography), forwarder_projects(owner_id, origin_city, origin_country, destination_city, destination_country)",
    )
    .order("created_at", { ascending: false })
    .limit(500);
  const raw = (data ?? []) as Row[];

  // Market Report interest has no project: whoever owns one of that client's
  // projects may act on it (as can_act_on_client_request() in the database).
  const interestClients = [...new Set(raw.filter((r) => r.kind === "report_interest").map((r) => r.client_id as string))];
  const [{ data: tpOwners }, { data: fpOwners }] = interestClients.length
    ? await Promise.all([
        supabase.from("three_pl_projects").select("client_id, owner_id").in("client_id", interestClients),
        supabase.from("forwarder_projects").select("client_id, owner_id").in("client_id", interestClients),
      ])
    : [{ data: [] }, { data: [] }];
  const ownersOf = new Map<string, string[]>();
  for (const p of [...(tpOwners ?? []), ...(fpOwners ?? [])] as { client_id: string; owner_id: string | null }[]) {
    if (p.owner_id) ownersOf.set(p.client_id, [...(ownersOf.get(p.client_id) ?? []), p.owner_id]);
  }

  // Introductions: which forwarder each letter is (staff only).
  const introProjects = [
    ...new Set(raw.filter((r) => r.kind === "introduction").map((r) => r.forwarder_project_id as string).filter(Boolean)),
  ];
  const { data: labelRows } = introProjects.length
    ? await supabase
        .from("market_report_partner_labels")
        .select("forwarder_project_id, label, forwarders(company_name)")
        .in("forwarder_project_id", introProjects)
    : { data: [] };
  const partnerName = new Map(
    ((labelRows ?? []) as Row[]).map((l) => [
      `${l.forwarder_project_id}:${l.label}`,
      (embeddedOne(l.forwarders as Row | Row[] | null)?.company_name as string | undefined) ?? null,
    ]),
  );

  const rows: InboxRow[] = raw.map((r) => {
    const tp = embeddedOne(r.three_pl_projects as Row | Row[] | null);
    const fp = embeddedOne(r.forwarder_projects as Row | Row[] | null);
    const client = embeddedOne(r.clients as Row | Row[] | null);
    const route = fp ? shortRouteLabel(fp) : ((tp?.target_geography as string | null) ?? null);
    return {
      ...(r as unknown as InboxRow),
      reply_history: Array.isArray(r.reply_history) ? (r.reply_history as InboxRow["reply_history"]) : [],
      projectOwnerId: ((tp ?? fp)?.owner_id as string | undefined) ?? null,
      clientOwnerIds: ownersOf.get(r.client_id as string) ?? [],
      projectLabel: tp || fp ? `${kindLabel(fp ? "forwarder" : "three_pl")}${route ? ` · ${route}` : ""}` : "Market Report (free plan)",
      clientName: (client?.name as string | undefined) ?? "Client",
    };
  });
  const shown = inboxRows(rows, filter, me);

  const people = [
    ...new Set(
      shown.flatMap((r) => [r.created_by, r.replied_by, ...r.reply_history.flatMap((h) => [h.withdrawnBy])]).filter((x): x is string => !!x),
    ),
  ];
  const { data: profiles } = people.length
    ? await supabase.from("profiles").select("id, first_name").in("id", people)
    : { data: [] };
  const nameOf = new Map((profiles ?? []).map((p) => [p.id as string, firstWord(p.first_name) ?? "Someone"]));

  const items: RequestItemView[] = shown.map((r) => {
    const letter = r.partner_label ? `Partner ${r.partner_label}` : null;
    const resolved =
      r.kind === "introduction" && r.forwarder_project_id
        ? (partnerName.get(`${r.forwarder_project_id}:${r.partner_label}`) ?? "a forwarder that has since been deleted")
        : null;
    return {
      id: r.id,
      kindLabel: KIND[r.kind] ?? r.kind,
      title:
        r.kind === "question"
          ? (r.message ?? "").slice(0, 80) + ((r.message ?? "").length > 80 ? "…" : "")
          : r.kind === "introduction"
            ? `${letter} (${resolved})`
            : r.kind === "report_interest"
              ? "Unlock the Market Report"
              : (r.decision_snapshot?.recommendation?.name ?? "Recommendation"),
      message: r.message,
      decisionDetail:
        r.kind === "question"
          ? null
          : r.kind === "introduction"
            ? introductionDetail(letter!, resolved!, r.decision_snapshot)
            : r.kind === "report_interest"
              ? "Asked about the paid Market Report from the locked page (free plan). No price was shown."
              : `${r.kind === "approve" ? "Approved" : "Asked for changes to"} the recommendation "${r.decision_snapshot?.recommendation?.name ?? "?"}" in the update "${r.decision_snapshot?.headline ?? "?"}".${r.kind === "approve" ? " This tells Move to proceed; it doesn't move the stage." : ""}`,
      partnerLetter: r.kind === "introduction" ? letter : null,
      wantsCall: r.wants_call,
      status: r.status,
      createdAt: r.created_at,
      from: (r.created_by && nameOf.get(r.created_by)) || "A client user",
      clientName: r.clientName,
      projectLabel: r.projectLabel,
      projectHref:
        r.forwarder_project_id || r.three_pl_project_id
          ? projectPath(r.forwarder_project_id ? "forwarder" : "three_pl", (r.forwarder_project_id ?? r.three_pl_project_id)!)
          : `/client-access/${r.client_id}/preview/market-report`,
      reply: r.staff_reply,
      repliedAt: r.replied_at,
      replier: r.replied_by ? (nameOf.get(r.replied_by) ?? null) : null,
      withdrawn: r.reply_history.map((h) => ({
        reply: h.reply ?? "",
        by: (h.withdrawnBy && nameOf.get(h.withdrawnBy)) || "an admin",
        at: h.withdrawnAt ?? null,
      })),
      canAct: canAct(r, me, isAdmin),
      isAdmin,
    };
  });

  const href = (patch: Partial<InboxFilter>) => {
    const next = { ...filter, ...patch };
    const q = new URLSearchParams({ show: next.show, status: next.status, ...(next.project ? { project: next.project } : {}) });
    return `/client-requests?${q}`;
  };
  const chip = (active: boolean) =>
    `rounded-full px-3 py-1.5 text-sm font-semibold ${active ? "bg-move-navy text-white" : "border border-neutral-border bg-white text-move-navy"}`;

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-6 sm:px-8">
      <h1 className="font-display text-2xl font-semibold text-move-navy">Client requests</h1>
      <p className="mt-1 max-w-3xl text-sm text-neutral-muted">
        Approvals, change requests, questions, introduction requests and Market Report interest from client users. Opening
        one you can act on marks it as seen for the client. Only the project&apos;s owner or an admin can reply (Market
        Report interest: an admin or the owner of any of that client&apos;s projects); replies are shown to the client and
        can&apos;t be edited (an admin can withdraw one). An approval tells Move to proceed; it doesn&apos;t change the
        project&apos;s stage. Partner names behind letters are shown to staff only.
      </p>

      <nav aria-label="Filter requests" className="mt-4 flex flex-wrap gap-2">
        <Link href={href({ show: "mine" })} className={chip(filter.show === "mine")} aria-current={filter.show === "mine" ? "page" : undefined}>
          My projects
        </Link>
        <Link href={href({ show: "all" })} className={chip(filter.show === "all")} aria-current={filter.show === "all" ? "page" : undefined}>
          All projects
        </Link>
        <span className="mx-1 self-center text-neutral-muted" aria-hidden="true">
          |
        </span>
        {(["open", "answered", "all"] as const).map((s) => (
          <Link key={s} href={href({ status: s })} className={chip(filter.status === s)} aria-current={filter.status === s ? "page" : undefined}>
            {s === "open" ? "Open" : s === "answered" ? "Answered" : "Everything"}
          </Link>
        ))}
        {filter.project && (
          <Link href={href({ project: null })} className={chip(false)}>
            All projects&apos; requests ×
          </Link>
        )}
      </nav>

      {items.length === 0 ? (
        <p className="mt-6 text-sm text-move-navy">No requests here.</p>
      ) : (
        <ul className="mt-6 flex flex-col gap-3">
          {items.map((item) => (
            <RequestItem key={item.id} item={item} />
          ))}
        </ul>
      )}
    </div>
  );
}

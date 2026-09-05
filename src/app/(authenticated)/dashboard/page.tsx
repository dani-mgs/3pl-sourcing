import { createClient } from "@/lib/supabase/server";
import { DashboardContent, type DashboardRow } from "./dashboard-content";
import { STATUS_DOT_COLORS, type ProviderStatus } from "../projects/[id]/providers/status-badge";

const STATUS_ORDER: ProviderStatus[] = [
  "Potential / Not Contacted",
  "Baseline",
  "Contacted",
  "Client Requirements Sent",
  "Scheduled for Discovery Call",
  "Waiting for Quotation",
  "Reviewing Quotation",
  "Clarifications",
  "Negotiation",
  "Shortlisted",
  "Vetted",
  "Unfit",
  "Do not Contact",
  "Withdrawn / No Response",
  "Completed / Closed",
];

function formatRelativeTime(dateString: string): string {
  const diffMs = Date.now() - new Date(dateString).getTime();
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 60) return "Just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay === 1) return "Yesterday";
  if (diffDay < 7) return `${diffDay}d ago`;
  const diffWeek = Math.floor(diffDay / 7);
  if (diffWeek < 5) return `${diffWeek}w ago`;
  return new Date(dateString).toLocaleDateString();
}

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: clientRequirements } = await supabase
    .from("client_requirements")
    .select(
      "id, client_name, target_geography, business_model, owner_id, updated_at",
    )
    .order("updated_at", { ascending: false });

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, email, first_name");

  const { data: providers } = await supabase
    .from("three_pl_providers")
    .select("client_requirement_id, status");

  const ownerDisplayById = new Map(
    (profiles ?? []).map((profile) => [
      profile.id,
      profile.first_name?.trim() || profile.email,
    ]),
  );

  const statusCountsByClientId = new Map<string, Map<string, number>>();
  for (const provider of providers ?? []) {
    const counts =
      statusCountsByClientId.get(provider.client_requirement_id) ??
      new Map<string, number>();
    counts.set(provider.status, (counts.get(provider.status) ?? 0) + 1);
    statusCountsByClientId.set(provider.client_requirement_id, counts);
  }

  const rows: DashboardRow[] = (clientRequirements ?? []).map((cr) => {
    const statusCounts = statusCountsByClientId.get(cr.id);
    const providerCount = statusCounts
      ? Array.from(statusCounts.values()).reduce((sum, n) => sum + n, 0)
      : 0;

    const segments = STATUS_ORDER.map((status) => ({
      status,
      count: statusCounts?.get(status) ?? 0,
      color: STATUS_DOT_COLORS[status],
    })).filter((segment) => segment.count > 0);

    const topStatusText =
      providerCount === 0
        ? "No 3PLs yet"
        : [...segments]
            .sort((a, b) => b.count - a.count)
            .slice(0, 2)
            .map((segment) => `${segment.count} ${segment.status}`)
            .join(" · ");

    return {
      id: cr.id,
      clientName: cr.client_name,
      businessModel: cr.business_model,
      isMine: cr.owner_id === user?.id,
      ownerDisplay:
        cr.owner_id === user?.id
          ? "You"
          : (ownerDisplayById.get(cr.owner_id) ?? "—"),
      region: cr.target_geography,
      providerCount,
      pipelineSegments: segments,
      topStatusText,
      updatedRelative: formatRelativeTime(cr.updated_at),
    };
  });

  return (
    <div className="max-w-6xl px-8 py-10">
      <DashboardContent rows={rows} />
    </div>
  );
}

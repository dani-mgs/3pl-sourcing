import Link from "next/link";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";

// "Client requests" on a project page, with how many are new (unseen) and
// open. Shown only once the project has any.
export async function ProjectRequestsLink({ kind, projectId }: { kind: "forwarder" | "three_pl"; projectId: string }) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("client_requests")
    .select("status")
    .eq(kind === "forwarder" ? "forwarder_project_id" : "three_pl_project_id", projectId);
  const rows = (data ?? []) as { status: string }[];
  if (rows.length === 0) return null;
  const fresh = rows.filter((r) => r.status === "sent").length;
  return (
    <Button variant="outline" nativeButton={false} render={<Link href={`/client-requests?show=all&status=all&project=${projectId}`} />}>
      Client requests
      {fresh > 0 && <span className="ml-1 rounded-full bg-move-green px-1.5 text-xs font-bold text-move-navy">{fresh} new</span>}
    </Button>
  );
}

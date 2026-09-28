import {
  getClientOwner,
  type ProjectTable,
} from "@/lib/auth/get-ownership-context";

// Shown on every read-only project page (3PL: Project Info, Project Summary,
// 3PL View, Recommendation; Forwarder: Project Summary) when the viewer can't
// write to this project.
export async function ViewOnlyBanner({
  clientRequirementId,
  canWrite,
  table = "three_pl_projects",
}: {
  clientRequirementId: string;
  canWrite: boolean;
  table?: ProjectTable;
}) {
  if (canWrite) return null;

  const owner = await getClientOwner(clientRequirementId, table);
  if (!owner) return null;

  return (
    <div className="mb-6 rounded-xl border border-transparent bg-[#E3F2FD] px-4 py-3 text-sm font-medium text-[#1565C0]">
      Owned by {owner.displayName} — view only
    </div>
  );
}

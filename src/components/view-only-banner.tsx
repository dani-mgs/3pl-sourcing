import { getClientOwner } from "@/lib/auth/get-ownership-context";

// Shown on every read-only client page (Client Info, Project Summary, 3PL
// View, Recommendation) when the viewer can't write to this client.
export async function ViewOnlyBanner({
  clientRequirementId,
  canWrite,
}: {
  clientRequirementId: string;
  canWrite: boolean;
}) {
  if (canWrite) return null;

  const owner = await getClientOwner(clientRequirementId);
  if (!owner) return null;

  return (
    <div className="mb-6 rounded-xl border border-transparent bg-[#E3F2FD] px-4 py-3 text-sm font-medium text-[#1565C0]">
      Owned by {owner.displayName} — view only
    </div>
  );
}

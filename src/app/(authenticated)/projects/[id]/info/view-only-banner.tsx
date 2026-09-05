export function ViewOnlyBanner({ ownerDisplayName }: { ownerDisplayName: string }) {
  return (
    <div className="mb-6 rounded-xl border border-transparent bg-[#E3F2FD] px-4 py-3 text-sm font-medium text-[#1565C0]">
      View only — {ownerDisplayName} owns this client
    </div>
  );
}

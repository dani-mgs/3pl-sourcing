import Link from "next/link";

export function PreviewBanner({ clientName }: { clientName: string }) {
  return (
    <div role="note" className="mx-auto mb-6 flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-move-navy bg-white px-5 py-3 text-sm text-move-navy">
      <p>
        <span className="font-semibold">Viewing as {clientName}.</span> This is exactly what their portal users see: only
        published updates. Read-only.
      </p>
      <Link href="/client-access" className="font-semibold underline">
        Back to Client access
      </Link>
    </div>
  );
}

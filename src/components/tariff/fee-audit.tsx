import type { FeeAudit } from "@/lib/tariff/fee-audit";

// The "Changes" cell of a customs fee row: who created and last changed it,
// and its history, collapsed. No hooks, so it renders on the server.
export function FeeAuditCell({ audit }: { audit: FeeAudit }) {
  return (
    <div className="flex flex-col gap-0.5 text-xs" data-testid="fee-audit">
      <p className="text-move-navy">{audit.created}</p>
      <p className="text-neutral-muted">{audit.lastChanged}</p>
      <details className="mt-1">
        <summary className="cursor-pointer font-medium text-move-green">History ({audit.history.length})</summary>
        {audit.history.length === 0 ? (
          <p className="mt-1 text-neutral-muted">{audit.emptyHistoryText}</p>
        ) : (
          <ul className="mt-1 flex max-h-48 w-64 flex-col gap-1 overflow-y-auto">
            {audit.history.map((h) => (
              <li key={h.id} className="break-words text-neutral-muted">
                {h.text}
              </li>
            ))}
          </ul>
        )}
      </details>
    </div>
  );
}

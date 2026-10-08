// Building blocks for the summary tile rows on the Project Summary and the
// forwarder detail page.

export function Tile({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col rounded-2xl border border-neutral-border bg-white p-4 shadow-sm">
      <p className="text-xs font-medium tracking-wide text-neutral-muted uppercase">{label}</p>
      <div className="mt-1.5 flex min-w-0 flex-col gap-0.5">{children}</div>
    </div>
  );
}

export function Value({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={`font-display text-xl font-semibold tabular-nums ${className ?? "text-move-navy"}`}>
      {children}
    </p>
  );
}

// One line that truncates with an ellipsis; wrap lets it run onto more lines
// instead (for text that must stay readable in a narrow tile).
export function Detail({
  children,
  title,
  wrap,
}: {
  children: React.ReactNode;
  title?: string;
  wrap?: boolean;
}) {
  return (
    <p
      className={`${wrap ? "break-words" : "truncate"} text-xs text-neutral-muted`}
      title={title}
    >
      {children}
    </p>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-1 text-sm text-neutral-muted">{children}</p>;
}

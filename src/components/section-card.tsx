export function SectionCard({
  title,
  children,
  className,
  action,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
  // Optional control (e.g. an Add button) shown to the right of the title.
  action?: React.ReactNode;
}) {
  return (
    <section
      className={
        "rounded-2xl border border-neutral-border bg-white p-6 shadow-sm" +
        (className ? ` ${className}` : "")
      }
    >
      {action ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-lg font-semibold text-move-navy">{title}</h2>
          {action}
        </div>
      ) : (
        <h2 className="mb-4 font-display text-lg font-semibold text-move-navy">
          {title}
        </h2>
      )}
      {children}
    </section>
  );
}

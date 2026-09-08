export function SectionCard({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={
        "rounded-2xl border border-neutral-border bg-white p-6 shadow-sm" +
        (className ? ` ${className}` : "")
      }
    >
      <h2 className="mb-4 font-display text-lg font-semibold text-move-navy">
        {title}
      </h2>
      {children}
    </section>
  );
}

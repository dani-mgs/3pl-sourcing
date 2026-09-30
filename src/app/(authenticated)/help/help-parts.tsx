// Small presentational pieces shared by the /help sections.

export function HelpSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="scroll-mt-24 rounded-2xl border border-neutral-border bg-white p-6 shadow-sm"
    >
      <h2 id={`${id}-title`} className="mb-4 font-display text-lg font-semibold text-move-navy">
        {title}
      </h2>
      <div className="flex flex-col gap-4 text-sm text-move-navy">{children}</div>
    </section>
  );
}

export function SubHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="font-display text-sm font-semibold text-move-navy">{children}</h3>;
}

export function Steps({ children }: { children: React.ReactNode }) {
  return (
    <ol className="flex list-decimal flex-col gap-1.5 pl-5 marker:text-neutral-muted">{children}</ol>
  );
}

export function Bullets({ children }: { children: React.ReactNode }) {
  return (
    <ul className="flex list-disc flex-col gap-1.5 pl-5 marker:text-neutral-muted">{children}</ul>
  );
}

export function Note({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-neutral-muted">{children}</p>;
}

// A UI label, quoted exactly as it appears in the app.
export function Ui({ children }: { children: React.ReactNode }) {
  return <span className="font-medium">{children}</span>;
}

export function Faq({ question, children }: { question: string; children: React.ReactNode }) {
  return (
    <details className="group rounded-xl border border-neutral-border px-4 py-3 open:bg-neutral-bg/60">
      <summary className="cursor-pointer font-medium outline-none marker:text-neutral-muted focus-visible:ring-2 focus-visible:ring-move-green">
        {question}
      </summary>
      <div className="mt-2 flex flex-col gap-2 text-move-navy">{children}</div>
    </details>
  );
}

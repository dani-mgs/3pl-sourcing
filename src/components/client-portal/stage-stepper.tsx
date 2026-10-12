import { CLIENT_STAGES } from "@/lib/client-updates/stages";

// The seven client stages, current one highlighted. The state of each step
// is written out ("done", "now") for screen readers, and shown with a tick
// or a ring, never by colour alone. Step labels show only when the panel is
// wide enough for them (a container query, so the half-width publish preview
// and a phone both get just the current stage's label above the bar).
export function StageStepper({ stage, tone }: { stage: number; tone: "teal" | "purple" }) {
  const current = CLIENT_STAGES.find((s) => s.stage === stage) ?? CLIENT_STAGES[0];
  const accent = tone === "teal" ? "bg-portal-teal border-portal-teal" : "bg-portal-purple border-portal-purple";
  const text = tone === "teal" ? "text-portal-teal" : "text-portal-purple";
  return (
    <div className="@container min-w-0">
      <p className="text-sm font-semibold text-portal-ink">
        Stage {current.stage} of 7 · {current.label}
      </p>
      <ol className="mt-2 grid grid-cols-7 gap-1" aria-label="Stages">
        {CLIENT_STAGES.map((s) => {
          const state = s.stage < stage ? "done" : s.stage === stage ? "now" : "next";
          return (
            <li key={s.stage} className="flex min-w-0 flex-col gap-1">
              <span
                aria-hidden="true"
                className={
                  "h-2 rounded-full border " +
                  (state === "done" ? accent : state === "now" ? `${accent} ring-2 ring-offset-1 ring-portal-ink` : "border-portal-line bg-white")
                }
              />
              <span className={`hidden text-[11px] leading-tight @2xl:block ${state === "next" ? "text-portal-muted" : text}`}>
                {state === "done" && <span aria-hidden="true">✓ </span>}
                {s.label}
                <span className="sr-only">{state === "done" ? " (done)" : state === "now" ? " (now)" : ""}</span>
              </span>
              <span className="sr-only @2xl:hidden">
                {s.label}
                {state === "done" ? " (done)" : state === "now" ? " (now)" : ""}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

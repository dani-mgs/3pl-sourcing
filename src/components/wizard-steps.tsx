const STEPS = [
  { number: 1, label: "Client" },
  { number: 2, label: "Add 3PLs" },
  { number: 3, label: "Verify Details" },
];

export function WizardSteps({ currentStep }: { currentStep: 1 | 2 | 3 }) {
  return (
    <div className="flex flex-col gap-6">
      <ol className="flex flex-col gap-4">
        {STEPS.map((step) => {
          const isCompleted = step.number < currentStep;
          const isCurrent = step.number === currentStep;

          return (
            <li key={step.number} className="flex items-center gap-3">
              <span
                className={
                  isCompleted || isCurrent
                    ? "flex size-7 shrink-0 items-center justify-center rounded-full bg-move-green text-xs font-semibold text-white"
                    : "flex size-7 shrink-0 items-center justify-center rounded-full border border-neutral-border text-xs font-semibold text-neutral-muted"
                }
              >
                {isCompleted ? "✓" : step.number}
              </span>
              <span
                className={
                  isCurrent
                    ? "text-sm font-semibold text-move-navy"
                    : isCompleted
                      ? "text-sm font-medium text-move-navy"
                      : "text-sm text-neutral-muted"
                }
              >
                {step.label}
              </span>
            </li>
          );
        })}
      </ol>

      <p className="max-w-52 text-xs text-neutral-muted">
        You become the project owner. Other experts get read access
        automatically; admins can reassign ownership from Administration.
      </p>
    </div>
  );
}

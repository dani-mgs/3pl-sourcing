export function ToggleChipDisplay({
  chips,
}: {
  chips: { label: string; selected: boolean }[];
}) {
  if (chips.length === 0) {
    return <p className="text-sm text-neutral-muted">—</p>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {chips.map((chip) => (
        <span
          key={chip.label}
          className={
            chip.selected
              ? "rounded-full bg-move-green px-3 py-1 text-xs font-medium text-white"
              : "rounded-full border border-neutral-border px-3 py-1 text-xs font-medium text-move-navy"
          }
        >
          {chip.label}
        </span>
      ))}
    </div>
  );
}

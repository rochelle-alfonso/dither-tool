interface LabeledSelectProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}

export function LabeledSelect({
  label,
  value,
  onChange,
  options,
}: LabeledSelectProps) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-16 shrink-0 text-[15px] text-neutral-300">{label}</span>
      <div className="relative min-w-0 flex-1">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-md border border-white/15 bg-[#1f1f1f] px-3 py-2 text-[15px] text-neutral-100"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400">
          ⌄
        </span>
      </div>
    </div>
  );
}

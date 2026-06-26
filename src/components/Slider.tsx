interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  display?: string;
  onChange: (value: number) => void;
}

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  display,
  onChange,
}: SliderProps) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="mb-5">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-[15px] text-neutral-200">{label}</span>
        <span className="text-[15px] tabular-nums text-neutral-400">
          {display ?? value}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{
          background: `linear-gradient(to right, #0a84ff 0%, #0a84ff ${pct}%, #3a3a3a ${pct}%, #3a3a3a 100%)`,
        }}
      />
    </div>
  );
}

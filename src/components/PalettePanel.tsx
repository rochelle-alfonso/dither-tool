import {
  detectPreset,
  MAX_PALETTE_SIZE,
  MIN_PALETTE_SIZE,
  normalizeHex,
  PALETTE_PRESETS,
  type PalettePresetId,
} from "../palette";
import { LabeledSelect } from "./LabeledSelect";

interface PalettePanelProps {
  colors: string[];
  onColorsChange: (colors: string[]) => void;
  presetId: PalettePresetId;
  onPresetChange: (presetId: PalettePresetId) => void;
}

export function PalettePanel({
  colors,
  onColorsChange,
  presetId,
  onPresetChange,
}: PalettePanelProps) {
  const updateColor = (index: number, hex: string) => {
    const next = colors.map((color, i) =>
      i === index ? normalizeHex(hex) : color
    );
    onColorsChange(next);
    onPresetChange(detectPreset(next));
  };

  const addColor = () => {
    if (colors.length >= MAX_PALETTE_SIZE) return;
    const next = [...colors, "#808080"];
    onColorsChange(next);
    onPresetChange("custom");
  };

  const removeColor = (index: number) => {
    if (colors.length <= MIN_PALETTE_SIZE) return;
    const next = colors.filter((_, i) => i !== index);
    onColorsChange(next);
    onPresetChange(detectPreset(next));
  };

  const handlePresetChange = (value: string) => {
    if (value === "custom") {
      onPresetChange("custom");
      return;
    }
    const preset = PALETTE_PRESETS.find((item) => item.id === value);
    if (!preset) return;
    onPresetChange(preset.id);
    onColorsChange([...preset.colors]);
  };

  const presetOptions = [
    { value: "custom", label: "Custom" },
    ...PALETTE_PRESETS.map((preset) => ({
      value: preset.id,
      label: preset.label,
    })),
  ];

  return (
    <section className="mb-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[15px] font-semibold text-neutral-100">Palette</h2>
        <button
          type="button"
          onClick={addColor}
          disabled={colors.length >= MAX_PALETTE_SIZE}
          className="flex h-7 w-7 items-center justify-center rounded text-lg text-neutral-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Add color"
          title="Add color"
        >
          +
        </button>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {colors.map((color, index) => (
          <div key={`${color}-${index}`} className="group relative">
            <label
              className="block h-9 w-9 cursor-pointer overflow-hidden rounded border border-white/10"
              style={{ backgroundColor: color }}
              title={`Edit ${color}`}
            >
              <input
                type="color"
                value={normalizeHex(color)}
                onChange={(e) => updateColor(index, e.target.value)}
                className="sr-only"
              />
            </label>
            {colors.length > MIN_PALETTE_SIZE && (
              <button
                type="button"
                onClick={() => removeColor(index)}
                className="absolute -right-1 -top-1 hidden h-4 w-4 items-center justify-center rounded-full bg-neutral-800 text-[10px] text-neutral-200 group-hover:flex"
                aria-label={`Remove ${color}`}
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>

      <LabeledSelect
        label="Presets"
        value={presetId}
        onChange={handlePresetChange}
        options={presetOptions}
      />
    </section>
  );
}

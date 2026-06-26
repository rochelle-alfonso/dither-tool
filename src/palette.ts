export type PalettePresetId =
  | "custom"
  | "black-white"
  | "cmyk-pop"
  | "gameboy"
  | "pico8";

export interface PalettePreset {
  id: PalettePresetId;
  label: string;
  colors: string[];
}

export const PALETTE_PRESETS: PalettePreset[] = [
  {
    id: "black-white",
    label: "Black & White",
    colors: ["#000000", "#ffffff"],
  },
  {
    id: "cmyk-pop",
    label: "CMYK Pop",
    colors: ["#000000", "#ffffff", "#ff00ff", "#00ffff"],
  },
  {
    id: "gameboy",
    label: "Game Boy",
    colors: ["#0f380f", "#306230", "#8bac0f", "#9bbc0f"],
  },
  {
    id: "pico8",
    label: "PICO-8",
    colors: [
      "#000000",
      "#1d2b53",
      "#7e2553",
      "#008751",
      "#ab5236",
      "#5f574f",
      "#c2c3c7",
      "#fff1e8",
      "#ff004d",
      "#ffa300",
      "#ffec27",
      "#00e436",
      "#29adff",
      "#83769c",
      "#ff77a8",
      "#ffccaa",
    ],
  },
];

export const DEFAULT_PALETTE = ["#000000", "#ffffff", "#ff00ff", "#00ffff"];

export const MAX_PALETTE_SIZE = 16;
export const MIN_PALETTE_SIZE = 2;

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export function normalizeHex(hex: string): string {
  const raw = hex.trim().replace(/^#/, "");
  if (raw.length === 3) {
    return `#${raw
      .split("")
      .map((c) => c + c)
      .join("")
      .toLowerCase()}`;
  }
  return `#${raw.slice(0, 6).padEnd(6, "0").toLowerCase()}`;
}

export function hexToRgb(hex: string): Rgb {
  const h = normalizeHex(hex).slice(1);
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const c = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

export function paletteToRgb(colors: string[]): Rgb[] {
  return colors.map(hexToRgb);
}

export function colorsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((color, i) => normalizeHex(color) === normalizeHex(b[i]));
}

export function detectPreset(colors: string[]): PalettePresetId {
  for (const preset of PALETTE_PRESETS) {
    if (colorsEqual(colors, preset.colors)) return preset.id;
  }
  return "custom";
}

export function nearestPaletteIndex(
  r: number,
  g: number,
  b: number,
  palette: Rgb[]
): number {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < palette.length; i++) {
    const p = palette[i];
    const dr = r - p.r;
    const dg = g - p.g;
    const db = b - p.b;
    const dist = dr * dr + dg * dg + db * db;
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return best;
}

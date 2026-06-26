import {
  nearestPaletteIndex,
  normalizeHex,
  paletteToRgb,
  type Rgb,
} from "./palette";

export type Algorithm =
  | "floyd-steinberg"
  | "jarvis"
  | "bayer"
  | "atkinson"
  | "noise";

export const ALGORITHMS: { value: Algorithm; label: string }[] = [
  { value: "floyd-steinberg", label: "Floyd-Steinberg" },
  { value: "jarvis", label: "Jarvis-Judice-Ninke" },
  { value: "bayer", label: "Bayer (Ordered)" },
  { value: "atkinson", label: "Atkinson" },
  { value: "noise", label: "Noise" },
];

export interface DitherParams {
  algorithm: Algorithm;
  /** Hex colors used for quantization. */
  palette: string[];
  /** Block size in pixels (>=1). Higher = chunkier output. */
  pixelationScale: number;
  /** Local-contrast / sharpening amount, 0..100. */
  detailEnhancement: number;
  /** Brightness offset, -100..100. */
  brightness: number;
  /** Midtone gamma, 0.1..2.5 (1 = neutral). */
  midtones: number;
  /** Pre-threshold random noise, 0..100. */
  noise: number;
  /** Bloom around bright areas, 0..100. */
  glow: number;
  /** Bayer only — posterize tones for bold bands (0 = fine glyph clusters). */
  patternClarity: number;
  /** Bayer only — matrix size in pixels (4 = large motifs, 8 = fine). */
  bayerSize: 4 | 8;
}

/** Result of dithering at the reduced (block) resolution. */
export interface DitherResult {
  /** Palette index per pixel. */
  indices: Uint8Array;
  /** Resolved palette colors (hex) used for this result. */
  palette: string[];
  /** Width in blocks. */
  width: number;
  /** Height in blocks. */
  height: number;
  /** Pixel size of each block when drawn at source resolution. */
  scale: number;
}

const BAYER_4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

const BAYER_8 = [
  [0, 32, 8, 40, 2, 34, 10, 42],
  [48, 16, 56, 24, 50, 18, 58, 26],
  [12, 44, 4, 36, 14, 46, 6, 38],
  [60, 28, 52, 20, 62, 30, 54, 22],
  [3, 35, 11, 43, 1, 33, 9, 41],
  [51, 19, 59, 27, 49, 17, 57, 25],
  [15, 47, 7, 39, 13, 45, 5, 37],
  [63, 31, 55, 23, 61, 29, 53, 21],
];

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function luminance(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/** Box blur on a grayscale Float32Array, used for the glow pass. */
function boxBlur(
  src: Float32Array,
  w: number,
  h: number,
  radius: number
): Float32Array {
  if (radius < 1) return src.slice();
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  const win = radius * 2 + 1;
  for (let y = 0; y < h; y++) {
    let acc = 0;
    const row = y * w;
    for (let x = -radius; x <= radius; x++) {
      acc += src[row + clamp(x, 0, w - 1)];
    }
    for (let x = 0; x < w; x++) {
      tmp[row + x] = acc / win;
      const add = src[row + clamp(x + radius + 1, 0, w - 1)];
      const sub = src[row + clamp(x - radius, 0, w - 1)];
      acc += add - sub;
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let y = -radius; y <= radius; y++) {
      acc += tmp[clamp(y, 0, h - 1) * w + x];
    }
    for (let y = 0; y < h; y++) {
      out[y * w + x] = acc / win;
      const add = tmp[clamp(y + radius + 1, 0, h - 1) * w + x];
      const sub = tmp[clamp(y - radius, 0, h - 1) * w + x];
      acc += add - sub;
    }
  }
  return out;
}

/**
 * Builds a downscaled RGB buffer (averaging each block) and applies tonal
 * adjustments per channel.
 */
function preprocess(
  src: Uint8ClampedArray,
  srcW: number,
  srcH: number,
  p: DitherParams
): { rgb: Float32Array; w: number; h: number } {
  const scale = Math.max(1, Math.round(p.pixelationScale));
  const w = Math.max(1, Math.floor(srcW / scale));
  const h = Math.max(1, Math.floor(srcH / scale));
  const rgb = new Float32Array(w * h * 3);

  for (let by = 0; by < h; by++) {
    for (let bx = 0; bx < w; bx++) {
      let sr = 0;
      let sg = 0;
      let sb = 0;
      let count = 0;
      const x0 = bx * scale;
      const y0 = by * scale;
      for (let dy = 0; dy < scale; dy++) {
        const sy = y0 + dy;
        if (sy >= srcH) break;
        for (let dx = 0; dx < scale; dx++) {
          const sx = x0 + dx;
          if (sx >= srcW) break;
          const i = (sy * srcW + sx) * 4;
          sr += src[i];
          sg += src[i + 1];
          sb += src[i + 2];
          count++;
        }
      }
      const idx = (by * w + bx) * 3;
      rgb[idx] = count ? sr / count : 0;
      rgb[idx + 1] = count ? sg / count : 0;
      rgb[idx + 2] = count ? sb / count : 0;
    }
  }

  const gray = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    gray[i] = luminance(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]);
  }

  if (p.glow > 0) {
    const radius = Math.max(1, Math.round((p.glow / 100) * 4) + 1);
    const blurred = boxBlur(gray, w, h, radius);
    const amount = (p.glow / 100) * 0.9;
    for (let i = 0; i < gray.length; i++) {
      const bloom = Math.max(0, blurred[i] - 110);
      const boost = bloom * amount;
      const base = gray[i];
      const ratio = base > 1 ? (base + boost) / base : 1;
      rgb[i * 3] *= ratio;
      rgb[i * 3 + 1] *= ratio;
      rgb[i * 3 + 2] *= ratio;
      gray[i] = base + boost;
    }
  }

  if (p.detailEnhancement > 0) {
    const amount = (p.detailEnhancement / 100) * 1.6;
    const blurred = boxBlur(gray, w, h, 1);
    for (let i = 0; i < gray.length; i++) {
      const high = gray[i] - blurred[i];
      const next = gray[i] + high * amount;
      const ratio = gray[i] > 1 ? next / gray[i] : 1;
      rgb[i * 3] *= ratio;
      rgb[i * 3 + 1] *= ratio;
      rgb[i * 3 + 2] *= ratio;
      gray[i] = next;
    }
  }

  const gamma = clamp(p.midtones, 0.1, 3);
  for (let i = 0; i < w * h; i++) {
    for (let c = 0; c < 3; c++) {
      const ci = i * 3 + c;
      let v = rgb[ci];
      v += (p.brightness / 100) * 128;
      v = clamp(v, 0, 255);
      v = 255 * Math.pow(v / 255, 1 / gamma);
      if (p.noise > 0) {
        v += (Math.random() - 0.5) * (p.noise / 100) * 160;
      }
      rgb[ci] = clamp(v, 0, 255);
    }
  }

  return { rgb, w, h };
}

function errorDiffuseColor(
  rgb: Float32Array,
  w: number,
  h: number,
  palette: Rgb[],
  kernel: { dx: number; dy: number; weight: number }[],
  divisor: number
): Uint8Array {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      const pi = idx * 3;
      const oldR = rgb[pi];
      const oldG = rgb[pi + 1];
      const oldB = rgb[pi + 2];
      const palIdx = nearestPaletteIndex(oldR, oldG, oldB, palette);
      const next = palette[palIdx];
      out[idx] = palIdx;
      const errR = oldR - next.r;
      const errG = oldG - next.g;
      const errB = oldB - next.b;
      rgb[pi] = next.r;
      rgb[pi + 1] = next.g;
      rgb[pi + 2] = next.b;
      for (const k of kernel) {
        const nx = x + k.dx;
        const ny = y + k.dy;
        if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
        const ni = (ny * w + nx) * 3;
        const factor = k.weight / divisor;
        rgb[ni] += errR * factor;
        rgb[ni + 1] += errG * factor;
        rgb[ni + 2] += errB * factor;
      }
    }
  }
  return out;
}

function posterize(value: number, levels: number): number {
  if (levels >= 64) return value;
  const step = 255 / (levels - 1);
  return clamp(Math.round(value / step) * step, 0, 255);
}

function clarityLevels(clarity: number): number {
  if (clarity <= 0) return 256;
  return Math.max(2, Math.round(64 - (clarity / 100) * 58));
}

/** Dark / light palette indices by luminance (for 2-color Bayer). */
function paletteToneIndices(palette: Rgb[]): { dark: number; light: number } {
  let dark = 0;
  let light = 0;
  let darkLum = Infinity;
  let lightLum = -Infinity;
  for (let i = 0; i < palette.length; i++) {
    const lum = luminance(palette[i].r, palette[i].g, palette[i].b);
    if (lum < darkLum) {
      darkLum = lum;
      dark = i;
    }
    if (lum > lightLum) {
      lightLum = lum;
      light = i;
    }
  }
  return { dark, light };
}

/** Palette indices sorted dark → light for ordered multi-color Bayer. */
function paletteByLuminance(palette: Rgb[]): number[] {
  return palette
    .map((color, index) => ({ index, lum: luminance(color.r, color.g, color.b) }))
    .sort((a, b) => a.lum - b.lum)
    .map((entry) => entry.index);
}

function bayerColor(
  rgb: Float32Array,
  w: number,
  h: number,
  palette: Rgb[],
  clarity: number,
  bayerSize: 4 | 8
): Uint8Array {
  const out = new Uint8Array(w * h);
  const matrix = bayerSize === 4 ? BAYER_4 : BAYER_8;
  const mask = bayerSize - 1;
  const n2 = bayerSize * bayerSize;
  const levels = clarityLevels(clarity);
  const tones =
    palette.length === 2 ? paletteToneIndices(palette) : null;
  const ordered =
    palette.length > 2 ? paletteByLuminance(palette) : null;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      const pi = idx * 3;
      const r = rgb[pi];
      const g = rgb[pi + 1];
      const b = rgb[pi + 2];
      const lum = luminance(r, g, b);
      // Screen-space drift at glyph mode reveals diamond/cross clusters on flat tones.
      const drift =
        clarity <= 0
          ? ((x / Math.max(w - 1, 1) - 0.5) + (y / Math.max(h - 1, 1) - 0.5)) *
            22
          : 0;
      const qLum = posterize(clamp(lum + drift, 0, 255), levels);
      const matrixVal = matrix[y & mask][x & mask];
      const v = (qLum / 255) * n2;

      if (tones) {
        out[idx] = v > matrixVal ? tones.light : tones.dark;
      } else if (ordered) {
        const base = (qLum / 255) * (palette.length - 1);
        const pick = clamp(
          Math.floor(base + (matrixVal / n2 - 0.5) * palette.length),
          0,
          palette.length - 1
        );
        out[idx] = ordered[pick];
      } else {
        out[idx] = 0;
      }
    }
  }
  return out;
}

function noiseColor(
  rgb: Float32Array,
  w: number,
  h: number,
  palette: Rgb[]
): Uint8Array {
  const out = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const pi = i * 3;
    const perturb = (Math.random() - 0.5) * 128;
    const r = clamp(rgb[pi] + perturb, 0, 255);
    const g = clamp(rgb[pi + 1] + perturb, 0, 255);
    const b = clamp(rgb[pi + 2] + perturb, 0, 255);
    out[i] = nearestPaletteIndex(r, g, b, palette);
  }
  return out;
}

export function dither(
  src: Uint8ClampedArray,
  srcW: number,
  srcH: number,
  p: DitherParams
): DitherResult {
  const palette = p.palette.map(normalizeHex);
  const paletteRgb = paletteToRgb(palette);
  const { rgb, w, h } = preprocess(src, srcW, srcH, p);
  const scale = Math.max(1, Math.round(p.pixelationScale));
  let indices: Uint8Array;

  switch (p.algorithm) {
    case "floyd-steinberg":
      indices = errorDiffuseColor(
        rgb,
        w,
        h,
        paletteRgb,
        [
          { dx: 1, dy: 0, weight: 7 },
          { dx: -1, dy: 1, weight: 3 },
          { dx: 0, dy: 1, weight: 5 },
          { dx: 1, dy: 1, weight: 1 },
        ],
        16
      );
      break;
    case "jarvis":
      indices = errorDiffuseColor(
        rgb,
        w,
        h,
        paletteRgb,
        [
          { dx: 1, dy: 0, weight: 7 },
          { dx: 2, dy: 0, weight: 5 },
          { dx: -2, dy: 1, weight: 3 },
          { dx: -1, dy: 1, weight: 5 },
          { dx: 0, dy: 1, weight: 7 },
          { dx: 1, dy: 1, weight: 5 },
          { dx: 2, dy: 1, weight: 3 },
          { dx: -2, dy: 2, weight: 1 },
          { dx: -1, dy: 2, weight: 3 },
          { dx: 0, dy: 2, weight: 5 },
          { dx: 1, dy: 2, weight: 3 },
          { dx: 2, dy: 2, weight: 1 },
        ],
        48
      );
      break;
    case "atkinson":
      indices = errorDiffuseColor(
        rgb,
        w,
        h,
        paletteRgb,
        [
          { dx: 1, dy: 0, weight: 1 },
          { dx: 2, dy: 0, weight: 1 },
          { dx: -1, dy: 1, weight: 1 },
          { dx: 0, dy: 1, weight: 1 },
          { dx: 1, dy: 1, weight: 1 },
          { dx: 0, dy: 2, weight: 1 },
        ],
        8
      );
      break;
    case "bayer":
      indices = bayerColor(
        rgb,
        w,
        h,
        paletteRgb,
        p.patternClarity,
        p.bayerSize
      );
      break;
    case "noise":
    default:
      indices = noiseColor(rgb, w, h, paletteRgb);
      break;
  }

  return { indices, palette, width: w, height: h, scale };
}

/** Draws a dither result onto a canvas at full (source) resolution. */
export function renderToCanvas(
  result: DitherResult,
  canvas: HTMLCanvasElement
): void {
  const { indices, palette, width, height, scale } = result;
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(width, height);
  const paletteRgb = paletteToRgb(palette);

  for (let i = 0; i < indices.length; i++) {
    const color = paletteRgb[indices[i]] ?? paletteRgb[0];
    img.data[i * 4] = color.r;
    img.data[i * 4 + 1] = color.g;
    img.data[i * 4 + 2] = color.b;
    img.data[i * 4 + 3] = 255;
  }

  const tmp = document.createElement("canvas");
  tmp.width = width;
  tmp.height = height;
  tmp.getContext("2d")!.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(tmp, 0, 0, canvas.width, canvas.height);
}

/**
 * Builds an SVG string with one merged path per palette color.
 */
export function resultToSvg(result: DitherResult): string {
  const { indices, palette, width, height, scale } = result;
  const w = width * scale;
  const h = height * scale;
  const paths = palette.map(() => "");

  for (let y = 0; y < height; y++) {
    let runStart = -1;
    let runColor = -1;
    for (let x = 0; x <= width; x++) {
      const colorIdx = x < width ? indices[y * width + x] : -1;
      if (colorIdx === runColor && runStart !== -1) continue;
      if (runStart !== -1 && runColor !== -1) {
        const px = runStart * scale;
        const py = y * scale;
        const rw = (x - runStart) * scale;
        paths[runColor] += `M${px} ${py}h${rw}v${scale}h${-rw}z`;
      }
      runStart = x;
      runColor = colorIdx;
    }
  }

  const bg = palette[0] ?? "#ffffff";
  const pathEls = palette
    .map((color, i) =>
      paths[i]
        ? `<path d="${paths[i]}" fill="${color}"/>`
        : ""
    )
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges"><rect width="${w}" height="${h}" fill="${bg}"/>${pathEls}</svg>`;
}

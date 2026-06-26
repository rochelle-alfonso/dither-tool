export type Algorithm =
  | "floyd-steinberg"
  | "jarvis"
  | "bayer"
  | "atkinson"
  | "noise";

export const ALGORITHMS: { value: Algorithm; label: string }[] = [
  { value: "floyd-steinberg", label: "Floyd-Steinberg" },
  { value: "jarvis", label: "Jarvis-Judice-Ninke" },
  { value: "bayer", label: "Bayer" },
  { value: "atkinson", label: "Atkinson" },
  { value: "noise", label: "Noise" },
];

export interface DitherParams {
  algorithm: Algorithm;
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
}

/** Result of dithering at the reduced (block) resolution. */
export interface DitherResult {
  /** 1 = white pixel, 0 = black pixel. Length = width * height. */
  bitmap: Uint8Array;
  /** Width in blocks. */
  width: number;
  /** Height in blocks. */
  height: number;
  /** Pixel size of each block when drawn at source resolution. */
  scale: number;
}

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
  // Horizontal pass.
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
  // Vertical pass.
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
 * Builds a downscaled grayscale buffer (averaging each block) and applies the
 * tonal adjustments: brightness, midtone gamma, detail enhancement, noise, glow.
 */
function preprocess(
  src: Uint8ClampedArray,
  srcW: number,
  srcH: number,
  p: DitherParams
): { gray: Float32Array; w: number; h: number } {
  const scale = Math.max(1, Math.round(p.pixelationScale));
  const w = Math.max(1, Math.floor(srcW / scale));
  const h = Math.max(1, Math.floor(srcH / scale));
  const gray = new Float32Array(w * h);

  // Downsample by averaging the luminance of each block.
  for (let by = 0; by < h; by++) {
    for (let bx = 0; bx < w; bx++) {
      let sum = 0;
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
          sum += 0.299 * src[i] + 0.587 * src[i + 1] + 0.114 * src[i + 2];
          count++;
        }
      }
      gray[by * w + bx] = count ? sum / count : 0;
    }
  }

  // Glow: add a blurred copy of the bright regions back into the image.
  if (p.glow > 0) {
    const radius = Math.max(1, Math.round((p.glow / 100) * 4) + 1);
    const blurred = boxBlur(gray, w, h, radius);
    const amount = (p.glow / 100) * 0.9;
    for (let i = 0; i < gray.length; i++) {
      const bloom = Math.max(0, blurred[i] - 110);
      gray[i] = gray[i] + bloom * amount;
    }
  }

  // Detail enhancement: unsharp mask (sharpen) + slight contrast.
  if (p.detailEnhancement > 0) {
    const amount = (p.detailEnhancement / 100) * 1.6;
    const blurred = boxBlur(gray, w, h, 1);
    for (let i = 0; i < gray.length; i++) {
      const high = gray[i] - blurred[i];
      gray[i] = gray[i] + high * amount;
    }
  }

  const gamma = clamp(p.midtones, 0.1, 3);
  for (let i = 0; i < gray.length; i++) {
    let v = gray[i];
    v += (p.brightness / 100) * 128;
    v = clamp(v, 0, 255);
    v = 255 * Math.pow(v / 255, 1 / gamma);
    if (p.noise > 0) {
      v += (Math.random() - 0.5) * (p.noise / 100) * 160;
    }
    gray[i] = clamp(v, 0, 255);
  }

  return { gray, w, h };
}

function errorDiffuse(
  gray: Float32Array,
  w: number,
  h: number,
  kernel: { dx: number; dy: number; weight: number }[],
  divisor: number
): Uint8Array {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      const old = gray[idx];
      const next = old < 128 ? 0 : 255;
      out[idx] = next === 255 ? 1 : 0;
      const err = old - next;
      for (const k of kernel) {
        const nx = x + k.dx;
        const ny = y + k.dy;
        if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
        gray[ny * w + nx] += (err * k.weight) / divisor;
      }
    }
  }
  return out;
}

export function dither(
  src: Uint8ClampedArray,
  srcW: number,
  srcH: number,
  p: DitherParams
): DitherResult {
  const { gray, w, h } = preprocess(src, srcW, srcH, p);
  const scale = Math.max(1, Math.round(p.pixelationScale));
  let bitmap: Uint8Array;

  switch (p.algorithm) {
    case "floyd-steinberg":
      bitmap = errorDiffuse(
        gray,
        w,
        h,
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
      bitmap = errorDiffuse(
        gray,
        w,
        h,
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
      bitmap = errorDiffuse(
        gray,
        w,
        h,
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
    case "bayer": {
      bitmap = new Uint8Array(w * h);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const threshold = (BAYER_8[y & 7][x & 7] / 64) * 255;
          bitmap[y * w + x] = gray[y * w + x] > threshold ? 1 : 0;
        }
      }
      break;
    }
    case "noise":
    default: {
      bitmap = new Uint8Array(w * h);
      for (let i = 0; i < gray.length; i++) {
        bitmap[i] = gray[i] > Math.random() * 255 ? 1 : 0;
      }
      break;
    }
  }

  return { bitmap, width: w, height: h, scale };
}

/** Draws a dither result onto a canvas at full (source) resolution. */
export function renderToCanvas(
  result: DitherResult,
  canvas: HTMLCanvasElement
): void {
  const { bitmap, width, height, scale } = result;
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(width, height);
  for (let i = 0; i < bitmap.length; i++) {
    const v = bitmap[i] ? 255 : 0;
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v;
    img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  // Draw the small bitmap, then scale it up with nearest-neighbor.
  const tmp = document.createElement("canvas");
  tmp.width = width;
  tmp.height = height;
  tmp.getContext("2d")!.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(tmp, 0, 0, canvas.width, canvas.height);
}

/**
 * Builds an SVG string. Black pixels become rects merged into a single path,
 * which keeps the file small while remaining crisp at any scale.
 */
export function resultToSvg(result: DitherResult): string {
  const { bitmap, width, height, scale } = result;
  const w = width * scale;
  const h = height * scale;
  let d = "";
  // Merge horizontal runs of black pixels into single rectangles per row.
  for (let y = 0; y < height; y++) {
    let runStart = -1;
    for (let x = 0; x <= width; x++) {
      const black = x < width && bitmap[y * width + x] === 0;
      if (black && runStart === -1) {
        runStart = x;
      } else if (!black && runStart !== -1) {
        const px = runStart * scale;
        const py = y * scale;
        const rw = (x - runStart) * scale;
        d += `M${px} ${py}h${rw}v${scale}h${-rw}z`;
        runStart = -1;
      }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges"><rect width="${w}" height="${h}" fill="#ffffff"/><path d="${d}" fill="#000000"/></svg>`;
}

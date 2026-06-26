/**
 * Pixel-art → SVG vectorizer.
 *
 * Unlike the dither SVG export (1-bit black/white), this preserves the original
 * colors. It detects the logical pixel grid of upscaled pixel art, samples each
 * cell, then merges same-color horizontal runs into rectangles grouped per color
 * into one <path> each — producing a compact, crisp, scalable SVG.
 */

export interface PixelSvgOptions {
  /** Logical pixel block size. Omit to auto-detect. */
  blockSize?: number;
  /** Color levels per channel (2..256). Omit/0 to keep exact colors. */
  quantize?: number;
}

export interface PixelSvgResult {
  svg: string;
  /** Detected (or supplied) block size used. */
  blockSize: number;
  /** Logical width in cells. */
  cols: number;
  /** Logical height in cells. */
  rows: number;
  /** Number of distinct colors emitted. */
  colors: number;
}

/** Guard against vectorizing smooth photos into millions of rects. */
const MAX_RECTS = 400_000;

function gcd(a: number, b: number): number {
  while (b) {
    [a, b] = [b, a % b];
  }
  return a;
}

/** Estimates the pixel-art block size from runs of identical adjacent pixels. */
export function detectPixelSize(
  data: Uint8ClampedArray,
  w: number,
  h: number
): number {
  let g = 0;
  const samePixel = (i: number, j: number) =>
    data[i] === data[j] &&
    data[i + 1] === data[j + 1] &&
    data[i + 2] === data[j + 2] &&
    data[i + 3] === data[j + 3];

  // Horizontal runs (sample a subset of rows for speed).
  const rowStep = Math.max(1, Math.floor(h / 64));
  for (let y = 0; y < h; y += rowStep) {
    let run = 1;
    for (let x = 1; x < w; x++) {
      const i = (y * w + x) * 4;
      if (samePixel(i, i - 4)) {
        run++;
      } else {
        g = gcd(g, run);
        run = 1;
      }
    }
    g = gcd(g, run);
  }
  // Vertical runs.
  const colStep = Math.max(1, Math.floor(w / 64));
  for (let x = 0; x < w; x += colStep) {
    let run = 1;
    for (let y = 1; y < h; y++) {
      const i = (y * w + x) * 4;
      if (samePixel(i, i - w * 4)) {
        run++;
      } else {
        g = gcd(g, run);
        run = 1;
      }
    }
    g = gcd(g, run);
  }

  if (!g || g < 1) return 1;
  return Math.min(g, 64);
}

function quantizeChannel(v: number, levels: number): number {
  const step = 255 / (levels - 1);
  return Math.round(Math.round(v / step) * step);
}

function toHex(r: number, g: number, b: number): string {
  return (
    "#" +
    [r, g, b]
      .map((c) => c.toString(16).padStart(2, "0"))
      .join("")
  );
}

export function pixelToSvg(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  options: PixelSvgOptions = {}
): PixelSvgResult {
  const blockSize =
    options.blockSize && options.blockSize > 0
      ? Math.round(options.blockSize)
      : detectPixelSize(data, w, h);
  const q = options.quantize && options.quantize >= 2 ? options.quantize : 0;

  const cols = Math.max(1, Math.floor(w / blockSize));
  const rows = Math.max(1, Math.floor(h / blockSize));
  const half = Math.floor(blockSize / 2);

  // color -> { d, alpha } path accumulation.
  const paths = new Map<string, { d: string; a: number }>();
  let rectCount = 0;

  for (let ry = 0; ry < rows; ry++) {
    const sy = Math.min(h - 1, ry * blockSize + half);
    let runStart = -1;
    let runKey = "";
    let runAlpha = 0;

    const flush = (end: number) => {
      if (runStart === -1) return;
      // Fully transparent runs are left empty (preserves transparency).
      if (runAlpha > 0) {
        let entry = paths.get(runKey);
        if (!entry) {
          entry = { d: "", a: runAlpha };
          paths.set(runKey, entry);
        }
        entry.d += `M${runStart} ${ry}h${end - runStart}v1h${
          runStart - end
        }z`;
        rectCount++;
      }
      runStart = -1;
    };

    for (let rx = 0; rx < cols; rx++) {
      const sx = Math.min(w - 1, rx * blockSize + half);
      const i = (sy * w + sx) * 4;
      let r = data[i];
      let g = data[i + 1];
      let b = data[i + 2];
      const a = data[i + 3];
      if (q) {
        r = quantizeChannel(r, q);
        g = quantizeChannel(g, q);
        b = quantizeChannel(b, q);
      }
      const key = a === 0 ? "transparent" : `${r},${g},${b},${a}`;
      if (key !== runKey) {
        flush(rx);
        runStart = rx;
        runKey = key;
        runAlpha = a;
      }
    }
    flush(cols);
  }

  if (rectCount > MAX_RECTS) {
    throw new Error(
      `This image isn't a clean pixel image (${rectCount.toLocaleString()} regions). ` +
        `Pixel → SVG works best on pixel art. Try increasing the pixel block size.`
    );
  }

  // Build SVG body. We re-derive hex from the key for the fill.
  let body = "";
  for (const [key, entry] of paths) {
    const [r, g, b] = key.split(",").map(Number);
    const fill = toHex(r, g, b);
    const opacity = entry.a < 255 ? ` fill-opacity="${(entry.a / 255).toFixed(3)}"` : "";
    body += `<path d="${entry.d}" fill="${fill}"${opacity}/>`;
  }

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${cols}" height="${rows}" ` +
    `viewBox="0 0 ${cols} ${rows}" shape-rendering="crispEdges">${body}</svg>`;

  return { svg, blockSize, cols, rows, colors: paths.size };
}

# Dither

A browser-based image dithering tool. Drop in any image, tweak the controls, and export the result as **PNG** or **SVG**.

**Live site:** https://rochelle-alfonso.github.io/dither-tool/

![Dither tool](https://img.shields.io/badge/vite-react--ts-blue)

## Features

- **5 dithering algorithms**: Floyd-Steinberg, Jarvis-Judice-Ninke, Bayer (ordered), Atkinson, and Noise (random threshold).
- **Live controls**:
  - **Pixelation Scale** — block size of the output (1 = fine, 16 = chunky).
  - **Detail Enhancement** — unsharp/local-contrast boost.
  - **Brightness** — exposure offset.
  - **Midtones** — gamma adjustment.
  - **Noise** — pre-threshold dither noise.
  - **Glow** — bloom around bright regions.
- **Drag & drop** or click the canvas to load an image.
- **Export**
  - **PNG** — rasterized 1-bit output at source resolution.
  - **SVG (dithered)** — crisp, scalable vector of the black/white dither (pixel runs merged into a single path).
  - **Pixel → SVG (color)** — converts a pixel-art PNG straight to a **color** vector. Auto-detects the logical pixel grid of upscaled art, samples each cell, and merges same-color runs into one `<path>` per color. Preserves transparency.

## Getting started

```bash
npm install
npm run dev      # start the dev server (http://localhost:5173)
npm run build    # type-check + production build
npm run preview  # preview the production build
npm run deploy   # build + publish to the gh-pages branch (GitHub Pages)
```

## Tech stack

- [Vite](https://vitejs.dev/) + React 19 + TypeScript
- [Tailwind CSS](https://tailwindcss.com/) for styling
- All image processing runs client-side on `<canvas>` — nothing is uploaded.

## How it works

`src/dither.ts` contains the engine:

1. **Downsample** the image into blocks (`Pixelation Scale`) and convert to grayscale.
2. **Tonal pass** — glow (box-blur bloom), detail enhancement (unsharp mask), brightness, midtone gamma, and noise.
3. **Dither** — error-diffusion (Floyd-Steinberg / Jarvis / Atkinson), ordered (Bayer 8×8), or random (Noise).
4. **Render** to a canvas (nearest-neighbor upscale) or serialize to SVG.

`src/vectorize.ts` is the standalone **Pixel → SVG (color)** converter: `detectPixelSize` finds the block size via the GCD of identical-pixel run lengths, then `pixelToSvg` samples each logical cell and emits compact per-color paths (with a safety cap so smooth photos don't explode into millions of rects).

The UI lives in `src/App.tsx` with a reusable `Slider` in `src/components/`.

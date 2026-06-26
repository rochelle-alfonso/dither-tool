import { useCallback, useEffect, useRef, useState } from "react";
import {
  ALGORITHMS,
  dither,
  renderToCanvas,
  resultToSvg,
  type Algorithm,
  type DitherParams,
} from "./dither";
import { pixelToSvg } from "./vectorize";
import { Slider } from "./components/Slider";

const MAX_DIMENSION = 1100;

const DEFAULT_PARAMS: DitherParams = {
  algorithm: "floyd-steinberg",
  pixelationScale: 1,
  detailEnhancement: 0,
  brightness: 0,
  midtones: 1,
  noise: 0,
  glow: 0,
};

/** Procedural placeholder so the canvas isn't empty on first load. */
function makeSampleImageData(w: number, h: number): ImageData {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  const grd = ctx.createLinearGradient(0, 0, w, h);
  grd.addColorStop(0, "#f5f5f5");
  grd.addColorStop(1, "#101010");
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, w, h);
  const sphere = ctx.createRadialGradient(
    w * 0.38,
    h * 0.4,
    10,
    w * 0.45,
    h * 0.5,
    Math.min(w, h) * 0.5
  );
  sphere.addColorStop(0, "#ffffff");
  sphere.addColorStop(0.6, "#777777");
  sphere.addColorStop(1, "#050505");
  ctx.fillStyle = sphere;
  ctx.beginPath();
  ctx.arc(w * 0.45, h * 0.5, Math.min(w, h) * 0.34, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#dcdcdc";
  ctx.font = `${Math.round(h * 0.09)}px -apple-system, sans-serif`;
  ctx.fillText("dither", w * 0.62, h * 0.86);
  return ctx.getImageData(0, 0, w, h);
}

export default function App() {
  const [params, setParams] = useState<DitherParams>(DEFAULT_PARAMS);
  const [source, setSource] = useState<ImageData | null>(null);
  const [fileName, setFileName] = useState("dither");
  const [exportOpen, setExportOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const thumbRef = useRef<HTMLCanvasElement>(null);
  const lastResult = useRef<ReturnType<typeof dither> | null>(null);

  // Seed with a procedural sample.
  useEffect(() => {
    setSource(makeSampleImageData(900, 560));
  }, []);

  const update = useCallback(
    <K extends keyof DitherParams>(key: K, value: DitherParams[K]) => {
      setParams((p) => ({ ...p, [key]: value }));
    },
    []
  );

  // Recompute and render whenever the source or params change.
  useEffect(() => {
    if (!source || !canvasRef.current) return;
    const result = dither(source.data, source.width, source.height, params);
    lastResult.current = result;
    renderToCanvas(result, canvasRef.current);

    if (thumbRef.current) {
      const t = thumbRef.current;
      t.width = source.width;
      t.height = source.height;
      t.getContext("2d")!.putImageData(source, 0, 0);
    }
  }, [source, params]);

  const loadFile = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) return;
    setFileName(file.name.replace(/\.[^.]+$/, "") || "dither");
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height));
      width = Math.round(width * scale);
      height = Math.round(height * scale);
      const c = document.createElement("canvas");
      c.width = width;
      c.height = height;
      const ctx = c.getContext("2d")!;
      ctx.drawImage(img, 0, 0, width, height);
      setSource(ctx.getImageData(0, 0, width, height));
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }, []);

  const exportPng = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      triggerDownload(URL.createObjectURL(blob), `${fileName}-dither.png`);
    }, "image/png");
    setExportOpen(false);
  }, [fileName]);

  const exportSvg = useCallback(() => {
    if (!lastResult.current) return;
    const svg = resultToSvg(lastResult.current);
    const blob = new Blob([svg], { type: "image/svg+xml" });
    triggerDownload(URL.createObjectURL(blob), `${fileName}-dither.svg`);
    setExportOpen(false);
  }, [fileName]);

  // Converts the ORIGINAL pixel image to a color SVG (no dithering).
  const exportPixelSvg = useCallback(() => {
    if (!source) return;
    setExportOpen(false);
    try {
      const { svg } = pixelToSvg(source.data, source.width, source.height);
      const blob = new Blob([svg], { type: "image/svg+xml" });
      triggerDownload(URL.createObjectURL(blob), `${fileName}-pixel.svg`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not vectorize image.");
    }
  }, [source, fileName]);

  return (
    <div className="flex h-full flex-col bg-[#0d0d0d] text-neutral-100">
      {/* Title bar */}
      <header className="flex items-center justify-between border-b border-white/5 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-neutral-800 text-xs">
            ◐
          </div>
          <h1 className="text-[15px] font-medium text-neutral-200">
            Dither — Apply amazing dithering effect for any images
          </h1>
        </div>
        <button
          className="text-neutral-500 hover:text-neutral-200"
          aria-label="close"
        >
          ✕
        </button>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Preview + thumbnail */}
        <main className="relative flex min-w-0 flex-1 flex-col p-3">
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const file = e.dataTransfer.files[0];
              if (file) loadFile(file);
            }}
            className={`relative flex flex-1 items-center justify-center overflow-hidden rounded-lg bg-white ${
              dragOver ? "ring-2 ring-accent" : ""
            }`}
          >
            <canvas
              ref={canvasRef}
              className="max-h-full max-w-full object-contain"
            />
            <input
              type="file"
              accept="image/*"
              className="absolute inset-0 cursor-pointer opacity-0"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) loadFile(file);
              }}
            />
            {dragOver && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/30 text-lg font-medium text-white">
                Drop image to dither
              </div>
            )}
          </label>

          <div className="mt-3 h-28 w-44 overflow-hidden rounded-md border border-white/10 bg-neutral-900">
            <canvas
              ref={thumbRef}
              className="h-full w-full object-cover opacity-80"
            />
          </div>
        </main>

        {/* Controls */}
        <aside className="flex w-[320px] flex-col border-l border-white/5 bg-[#161616] px-5 pt-5">
          <div className="relative mb-6">
            <select
              value={params.algorithm}
              onChange={(e) => update("algorithm", e.target.value as Algorithm)}
              className="w-full rounded-md border border-accent/70 bg-[#1f1f1f] px-3 py-2.5 text-[15px] text-neutral-100"
            >
              {ALGORITHMS.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </select>
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400">
              ⌄
            </span>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            <Slider
              label="Pixelation Scale"
              value={params.pixelationScale}
              min={1}
              max={16}
              onChange={(v) => update("pixelationScale", v)}
            />
            <Slider
              label="Detail Enhancement"
              value={params.detailEnhancement}
              min={0}
              max={100}
              onChange={(v) => update("detailEnhancement", v)}
            />
            <Slider
              label="Brightness"
              value={params.brightness}
              min={-100}
              max={100}
              onChange={(v) => update("brightness", v)}
            />
            <Slider
              label="Midtones"
              value={params.midtones}
              min={0.1}
              max={2.5}
              step={0.01}
              display={params.midtones.toFixed(2)}
              onChange={(v) => update("midtones", v)}
            />
            <Slider
              label="Noise"
              value={params.noise}
              min={0}
              max={100}
              onChange={(v) => update("noise", v)}
            />
            <Slider
              label="Glow"
              value={params.glow}
              min={0}
              max={100}
              onChange={(v) => update("glow", v)}
            />
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 border-t border-white/5 py-4">
            <div className="relative flex-1">
              <button
                onClick={() => setExportOpen((o) => !o)}
                className="w-full rounded-md bg-accent px-4 py-2.5 text-[15px] font-medium text-white hover:bg-[#0a7ae8]"
              >
                Export
              </button>
              {exportOpen && (
                <div className="absolute bottom-full left-0 mb-2 w-full overflow-hidden rounded-md border border-white/10 bg-[#262626] shadow-xl">
                  <button
                    onClick={exportPng}
                    className="block w-full px-4 py-2.5 text-left text-[15px] text-neutral-100 hover:bg-white/10"
                  >
                    Export as PNG
                  </button>
                  <button
                    onClick={exportSvg}
                    className="block w-full px-4 py-2.5 text-left text-[15px] text-neutral-100 hover:bg-white/10"
                  >
                    Export as SVG (dithered)
                  </button>
                  <div className="my-1 border-t border-white/10" />
                  <button
                    onClick={exportPixelSvg}
                    className="block w-full px-4 py-2.5 text-left text-[15px] text-neutral-100 hover:bg-white/10"
                  >
                    Pixel → SVG (color)
                  </button>
                </div>
              )}
            </div>
            <button
              onClick={() => setParams(DEFAULT_PARAMS)}
              className="flex-1 rounded-md bg-[#2a2a2a] px-4 py-2.5 text-[15px] font-medium text-neutral-200 hover:bg-[#333]"
            >
              Reset
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}

function triggerDownload(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

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
import { LabeledSelect } from "./components/LabeledSelect";
import { PalettePanel } from "./components/PalettePanel";
import { DEFAULT_PALETTE, type PalettePresetId } from "./palette";

const MAX_DIMENSION = 1100;

const DEFAULT_PARAMS: DitherParams = {
  algorithm: "bayer",
  palette: DEFAULT_PALETTE,
  pixelationScale: 1,
  detailEnhancement: 0,
  brightness: 0,
  midtones: 1,
  noise: 0,
  glow: 0,
  patternClarity: 0,
  bayerSize: 8,
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
  const [palettePreset, setPalettePreset] = useState<PalettePresetId>("cmyk-pop");
  const [source, setSource] = useState<ImageData | null>(null);
  const [hasUserImage, setHasUserImage] = useState(false);
  const [fileName, setFileName] = useState("dither");
  const [exportOpen, setExportOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const thumbRef = useRef<HTMLCanvasElement>(null);
  const lastResult = useRef<ReturnType<typeof dither> | null>(null);

  useEffect(() => {
    setSource(makeSampleImageData(900, 560));
  }, []);

  const update = useCallback(
    <K extends keyof DitherParams>(key: K, value: DitherParams[K]) => {
      setParams((p) => ({ ...p, [key]: value }));
    },
    []
  );

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
    setHasUserImage(true);
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
    if (!canvas || !hasUserImage) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      triggerDownload(URL.createObjectURL(blob), `${fileName}-dither.png`);
    }, "image/png");
    setExportOpen(false);
  }, [fileName, hasUserImage]);

  const exportSvg = useCallback(() => {
    if (!lastResult.current || !hasUserImage) return;
    const svg = resultToSvg(lastResult.current);
    const blob = new Blob([svg], { type: "image/svg+xml" });
    triggerDownload(URL.createObjectURL(blob), `${fileName}-dither.svg`);
    setExportOpen(false);
  }, [fileName, hasUserImage]);

  const exportPixelSvg = useCallback(() => {
    if (!source || !hasUserImage) return;
    setExportOpen(false);
    try {
      const { svg } = pixelToSvg(source.data, source.width, source.height);
      const blob = new Blob([svg], { type: "image/svg+xml" });
      triggerDownload(URL.createObjectURL(blob), `${fileName}-pixel.svg`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not vectorize image.");
    }
  }, [source, fileName, hasUserImage]);

  const statusText = hasUserImage
    ? `${params.palette.length} colors · ${ALGORITHMS.find((a) => a.value === params.algorithm)?.label ?? params.algorithm}`
    : "No image selected";

  return (
    <div className="flex h-full flex-col bg-[#0d0d0d] text-neutral-100">
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

        <aside className="flex w-[320px] flex-col border-l border-white/5 bg-[#2d2d2d] px-5 pt-5">
          <PalettePanel
            colors={params.palette}
            onColorsChange={(colors) => update("palette", colors)}
            presetId={palettePreset}
            onPresetChange={setPalettePreset}
          />

          <div className="mb-6 border-t border-white/10 pt-6">
            <h2 className="mb-4 text-[15px] font-semibold text-neutral-100">
              Dither Options
            </h2>
            <LabeledSelect
              label="Mode"
              value={params.algorithm}
              onChange={(value) => update("algorithm", value as Algorithm)}
              options={ALGORITHMS.map((algorithm) => ({
                value: algorithm.value,
                label: algorithm.label,
              }))}
            />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            <Slider
              label="Pixelation Scale"
              value={params.pixelationScale}
              min={1}
              max={16}
              onChange={(v) => update("pixelationScale", v)}
            />
            {params.algorithm === "bayer" && (
              <>
                <Slider
                  label="Pattern Clarity"
                  value={params.patternClarity}
                  min={0}
                  max={100}
                  display={
                    params.patternClarity === 0
                      ? "Glyphs"
                      : String(params.patternClarity)
                  }
                  onChange={(v) => update("patternClarity", v)}
                />
                <LabeledSelect
                  label="Pattern Size"
                  value={String(params.bayerSize)}
                  onChange={(value) =>
                    update("bayerSize", Number(value) as 4 | 8)
                  }
                  options={[
                    { value: "4", label: "4×4 — large motifs" },
                    { value: "8", label: "8×8 — fine detail" },
                  ]}
                />
              </>
            )}
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

          <div className="relative border-t border-white/10 py-4">
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <button
                  onClick={() => hasUserImage && setExportOpen((o) => !o)}
                  disabled={!hasUserImage}
                  className="w-full rounded-full bg-neutral-300 px-4 py-2.5 text-[15px] font-medium text-neutral-700 transition hover:bg-neutral-200 disabled:cursor-not-allowed disabled:bg-neutral-500 disabled:text-neutral-300"
                >
                  Dither it!
                </button>
                {exportOpen && hasUserImage && (
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
              <p
                className={`min-w-0 flex-1 text-sm ${
                  hasUserImage ? "text-neutral-400" : "text-orange-400"
                }`}
              >
                {statusText}
              </p>
              <button
                type="button"
                onClick={() => setHelpOpen((open) => !open)}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/15 text-sm text-neutral-300 hover:bg-white/10"
                aria-label="Help"
              >
                ?
              </button>
            </div>
            {helpOpen && (
              <div className="absolute bottom-full right-5 mb-2 w-56 rounded-md border border-white/10 bg-[#262626] p-3 text-sm text-neutral-300 shadow-xl">
                Pick palette colors or choose a preset, then drop an image to
                dither it live. Click a swatch to edit, hover to remove.
              </div>
            )}
            <button
              onClick={() => {
                setParams(DEFAULT_PARAMS);
                setPalettePreset("cmyk-pop");
              }}
              className="mt-3 w-full rounded-md bg-[#1f1f1f] px-4 py-2 text-[14px] text-neutral-300 hover:bg-[#333]"
            >
              Reset controls
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

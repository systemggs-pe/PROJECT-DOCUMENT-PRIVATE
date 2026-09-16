import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import { Crop, LoaderCircle, Move, ZoomIn } from "lucide-react";

import { Button } from "@/components/ui/button";

interface ImageCropEditorProps {
  file: File;
  onCancel: () => void;
  onApply: (file: File) => void;
}

type AspectOption = "original" | "1:1" | "4:3" | "3:4" | "16:9";

const aspectOptions: Array<{ value: AspectOption; label: string }> = [
  { value: "original", label: "Original" },
  { value: "1:1", label: "1:1" },
  { value: "4:3", label: "4:3" },
  { value: "3:4", label: "3:4" },
  { value: "16:9", label: "16:9" },
];

export function ImageCropEditor({ file, onCancel, onApply }: ImageCropEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const dragRef = useRef<{ x: number; y: number; centerX: number; centerY: number } | null>(null);
  const [aspect, setAspect] = useState<AspectOption>("original");
  const [zoom, setZoom] = useState(1);
  const [center, setCenter] = useState({ x: 0.5, y: 0.5 });
  const [error, setError] = useState("");
  const [isReady, setIsReady] = useState(false);
  const [isApplying, setIsApplying] = useState(false);

  const drawPreview = useCallback(() => {
    const image = imageRef.current;
    const canvas = canvasRef.current;
    if (!image || !canvas) return;
    const ratio = getAspectRatio(image, aspect);
    const width = 720;
    const height = Math.max(1, Math.round(width / ratio));
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return;
    const cropRect = getCropRect(image, ratio, zoom, center);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(image, cropRect.x, cropRect.y, cropRect.width, cropRect.height, 0, 0, width, height);
  }, [aspect, center, zoom]);

  useEffect(() => {
    const nextUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      imageRef.current = image;
      setIsReady(true);
      setError("");
    };
    image.onerror = () => setError("No se pudo cargar la imagen seleccionada.");
    image.src = nextUrl;
    return () => {
      URL.revokeObjectURL(nextUrl);
      imageRef.current = null;
    };
  }, [file]);

  useEffect(() => {
    drawPreview();
  }, [drawPreview, isReady]);

  async function applyCrop() {
    const image = imageRef.current;
    if (!image) return;
    setIsApplying(true);
    setError("");
    try {
      const cropRect = getCropRect(image, getAspectRatio(image, aspect), zoom, center);
      const outputWidth = Math.max(1, Math.min(1600, Math.round(cropRect.width)));
      const outputHeight = Math.max(1, Math.round(outputWidth / (cropRect.width / cropRect.height)));
      const canvas = document.createElement("canvas");
      canvas.width = outputWidth;
      canvas.height = outputHeight;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("No se pudo preparar el recorte.");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, outputWidth, outputHeight);
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(image, cropRect.x, cropRect.y, cropRect.width, cropRect.height, 0, 0, outputWidth, outputHeight);
      const blob = await canvasToBlob(canvas);
      onApply(new File([blob], croppedFileName(file.name), { type: "image/jpeg", lastModified: Date.now() }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo aplicar el recorte.");
    } finally {
      setIsApplying(false);
    }
  }

  function startDrag(event: PointerEvent<HTMLCanvasElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { x: event.clientX, y: event.clientY, centerX: center.x, centerY: center.y };
  }

  function moveDrag(event: PointerEvent<HTMLCanvasElement>) {
    const drag = dragRef.current;
    const image = imageRef.current;
    const canvas = canvasRef.current;
    if (!drag || !image || !canvas) return;
    const ratio = getAspectRatio(image, aspect);
    const cropRect = getCropRect(image, ratio, zoom, center);
    const deltaX = ((event.clientX - drag.x) / canvas.clientWidth) * cropRect.width;
    const deltaY = ((event.clientY - drag.y) / canvas.clientHeight) * cropRect.height;
    setCenter({
      x: clamp(drag.centerX - deltaX / image.naturalWidth, 0, 1),
      y: clamp(drag.centerY - deltaY / image.naturalHeight, 0, 1),
    });
  }

  function stopDrag(event: PointerEvent<HTMLCanvasElement>) {
    event.currentTarget.releasePointerCapture(event.pointerId);
    dragRef.current = null;
  }

  return (
    <div className="inline-dialog-backdrop">
      <section className="image-crop-dialog" role="dialog" aria-modal="true" aria-labelledby="image-crop-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Editor de imagen</p>
            <h3 id="image-crop-title">Recortar antes de subir</h3>
          </div>
          <Crop className="size-5" aria-hidden={true} />
        </div>

        <div className="image-crop-stage" aria-busy={!isReady}>
          {!error ? (
            <canvas
              ref={canvasRef}
              aria-label="Vista previa del recorte"
              onPointerDown={startDrag}
              onPointerMove={moveDrag}
              onPointerUp={stopDrag}
              onPointerCancel={stopDrag}
            />
          ) : null}
          {!isReady && !error ? <div className="loading-row" role="status"><LoaderCircle className="size-4 animate-spin" />Cargando imagen...</div> : null}
        </div>

        <div className="image-crop-controls">
          <label className="field">
            <span>Proporción</span>
            <select value={aspect} onChange={(event) => { setAspect(event.target.value as AspectOption); setCenter({ x: 0.5, y: 0.5 }); }}>
              {aspectOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label className="field">
            <span><ZoomIn className="size-4" aria-hidden={true} /> Zoom</span>
            <input type="range" min="1" max="4" step="0.01" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} />
          </label>
          <label className="field">
            <span><Move className="size-4" aria-hidden={true} /> Horizontal</span>
            <input type="range" min="0" max="1" step="0.001" value={center.x} onChange={(event) => setCenter((current) => ({ ...current, x: Number(event.target.value) }))} />
          </label>
          <label className="field">
            <span><Move className="size-4" aria-hidden={true} /> Vertical</span>
            <input type="range" min="0" max="1" step="0.001" value={center.y} onChange={(event) => setCenter((current) => ({ ...current, y: Number(event.target.value) }))} />
          </label>
        </div>

        {error ? <p className="studio-error" role="alert">{error}</p> : null}

        <div className="inline-dialog-actions">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={isApplying}>Cancelar</Button>
          <Button type="button" onClick={() => void applyCrop()} disabled={!isReady || isApplying}>
            <LoaderCircle className={`mr-2 size-4 ${isApplying ? "animate-spin" : "hidden"}`} />
            Aplicar recorte
          </Button>
        </div>
      </section>
    </div>
  );
}

function getAspectRatio(image: HTMLImageElement, aspect: AspectOption) {
  if (aspect === "1:1") return 1;
  if (aspect === "4:3") return 4 / 3;
  if (aspect === "3:4") return 3 / 4;
  if (aspect === "16:9") return 16 / 9;
  return image.naturalWidth / image.naturalHeight;
}

function getCropRect(image: HTMLImageElement, aspect: number, zoom: number, center: { x: number; y: number }) {
  const naturalWidth = image.naturalWidth;
  const naturalHeight = image.naturalHeight;
  let width = Math.min(naturalWidth, naturalHeight * aspect);
  let height = width / aspect;
  if (height > naturalHeight) {
    height = naturalHeight;
    width = height * aspect;
  }
  width /= zoom;
  height /= zoom;
  const x = clamp(center.x * naturalWidth - width / 2, 0, naturalWidth - width);
  const y = clamp(center.y * naturalHeight - height / 2, 0, naturalHeight - height);
  return { x, y, width, height };
}

function canvasToBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("No se pudo exportar la imagen.")), "image/jpeg", 0.92);
  });
}

function croppedFileName(name: string) {
  const baseName = name.replace(/\.[^.]+$/, "").trim() || "imagen";
  return `${baseName}-recortada.jpg`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

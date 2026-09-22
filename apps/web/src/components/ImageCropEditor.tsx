import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { Check, LoaderCircle, Maximize2, Minus, Plus, RotateCcw, RotateCw, Undo2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  applyAspectAroundCenter,
  calculateRotatedDimensions,
  clampCrop,
  cropZoomValue,
  fullCrop,
  initialCrop,
  maxCropZoom,
  minCropZoom,
  resizeCrop,
  rotateAndCropImage,
  rotateLeft,
  rotateRight,
  rotateWholeImage,
  zoomCropAroundCenter,
  type CropAspect,
  type CropHandle,
  type CropRect,
  type ImageDimensions,
  type Rotation,
} from "@/lib/image-crop";

interface ImageCropEditorProps {
  file: File;
  title?: string;
  contextName?: string;
  onCancel: () => void;
  onApply: (file: File) => void;
}

type DragState = {
  handle: CropHandle;
  startX: number;
  startY: number;
  startCrop: CropRect;
};

type PointerPoint = {
  x: number;
  y: number;
};

type PinchState = {
  startCrop: CropRect;
  startDistance: number;
  startZoom: number;
};

const handles: Array<{ value: CropHandle; label: string }> = [
  { value: "top-left", label: "Esquina superior izquierda" },
  { value: "top", label: "Borde superior" },
  { value: "top-right", label: "Esquina superior derecha" },
  { value: "right", label: "Borde derecho" },
  { value: "bottom-right", label: "Esquina inferior derecha" },
  { value: "bottom", label: "Borde inferior" },
  { value: "bottom-left", label: "Esquina inferior izquierda" },
  { value: "left", label: "Borde izquierdo" },
];

export function ImageCropEditor({ file, title = "Recortar antes de subir", contextName, onCancel, onApply }: ImageCropEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const activePointersRef = useRef(new Map<number, PointerPoint>());
  const pinchRef = useRef<PinchState | null>(null);
  const [imageSize, setImageSize] = useState<ImageDimensions | null>(null);
  const [stageSize, setStageSize] = useState({ width: 720, height: 480 });
  const [crop, setCrop] = useState<CropRect | null>(null);
  const [rotation, setRotation] = useState<Rotation>(0);
  const [aspectRatio, setAspectRatio] = useState<CropAspect>("free");
  const [error, setError] = useState("");
  const [isApplying, setIsApplying] = useState(false);

  const rotatedSize = useMemo(() => imageSize ? calculateRotatedDimensions(imageSize, rotation) : null, [imageSize, rotation]);
  const displaySize = useMemo(() => rotatedSize ? fitInto(rotatedSize, stageSize) : { width: 1, height: 1 }, [rotatedSize, stageSize]);
  const displayScale = rotatedSize ? displaySize.width / rotatedSize.width : 1;
  const zoomValue = crop && rotatedSize ? cropZoomValue(crop, rotatedSize) : minCropZoom;
  const zoomPercent = Math.round(zoomValue * 100);
  const cropTitle = contextName ? `Recortar ${formatContextName(contextName)}` : title;
  const cropSubtitle = contextName ? "Evidencias" : file.name;

  useEffect(() => {
    const nextUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      imageRef.current = image;
      const nextSize = { width: image.naturalWidth, height: image.naturalHeight };
      setImageSize(nextSize);
      setRotation(0);
      setAspectRatio("free");
      setCrop(initialCrop(nextSize, "free"));
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
    const stage = frameRef.current?.parentElement;
    if (!stage) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const width = Math.max(280, entry.contentRect.width - 24);
      const height = Math.max(260, entry.contentRect.height - 24);
      setStageSize({ width, height });
    });
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isApplying) onCancel();
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isApplying, onCancel]);

  const drawPreview = useCallback(() => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas || !image || !rotatedSize) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(displaySize.width * dpr));
    canvas.height = Math.max(1, Math.round(displaySize.height * dpr));
    canvas.style.width = `${displaySize.width}px`;
    canvas.style.height = `${displaySize.height}px`;

    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, displaySize.width, displaySize.height);
    context.fillStyle = "#fff";
    context.fillRect(0, 0, displaySize.width, displaySize.height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";

    const scale = displaySize.width / rotatedSize.width;
    if (rotation === 90) {
      context.translate(displaySize.width, 0);
      context.rotate(Math.PI / 2);
    } else if (rotation === 180) {
      context.translate(displaySize.width, displaySize.height);
      context.rotate(Math.PI);
    } else if (rotation === 270) {
      context.translate(0, displaySize.height);
      context.rotate(-Math.PI / 2);
    }
    context.drawImage(image, 0, 0, image.naturalWidth * scale, image.naturalHeight * scale);
  }, [displaySize.height, displaySize.width, rotatedSize, rotation]);

  useEffect(() => {
    drawPreview();
  }, [drawPreview]);

  function changeAspect(nextAspect: CropAspect) {
    if (!rotatedSize || !crop) return;
    setAspectRatio(nextAspect);
    setCrop(applyAspectAroundCenter(crop, rotatedSize, nextAspect));
  }

  function rotate(nextRotation: Rotation) {
    if (!imageSize) return;
    const nextSize = calculateRotatedDimensions(imageSize, nextRotation);
    setRotation(nextRotation);
    setCrop(initialCrop(nextSize, aspectRatio));
  }

  function resetEditor() {
    if (!imageSize) return;
    setRotation(0);
    setAspectRatio("free");
    setCrop(initialCrop(imageSize, "free"));
    activePointersRef.current.clear();
    pinchRef.current = null;
    dragRef.current = null;
  }

  function setZoom(nextZoom: number) {
    if (!rotatedSize || isApplying) return;
    setCrop((current) => current ? zoomCropAroundCenter(current, rotatedSize, aspectRatio, nextZoom) : current);
  }

  function startDrag(event: PointerEvent, handle: CropHandle) {
    if (!crop || !rotatedSize || isApplying) return;
    event.preventDefault();
    event.stopPropagation();
    frameRef.current?.setPointerCapture(event.pointerId);
    activePointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (activePointersRef.current.size >= 2) {
      const [first, second] = Array.from(activePointersRef.current.values());
      if (!first || !second) return;
      pinchRef.current = {
        startCrop: crop,
        startDistance: distanceBetween(first, second),
        startZoom: cropZoomValue(crop, rotatedSize),
      };
      dragRef.current = null;
      return;
    }
    dragRef.current = { handle, startX: event.clientX, startY: event.clientY, startCrop: crop };
  }

  function moveDrag(event: PointerEvent) {
    if (!rotatedSize || !activePointersRef.current.has(event.pointerId)) return;
    event.preventDefault();
    activePointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const pinch = pinchRef.current;
    const points = Array.from(activePointersRef.current.values());
    if (pinch && points.length >= 2) {
      if (!points[0] || !points[1]) return;
      const nextDistance = distanceBetween(points[0], points[1]);
      if (pinch.startDistance > 0) {
        setCrop(zoomCropAroundCenter(pinch.startCrop, rotatedSize, aspectRatio, pinch.startZoom * (nextDistance / pinch.startDistance)));
      }
      return;
    }

    const drag = dragRef.current;
    if (!drag) return;
    const deltaX = (event.clientX - drag.startX) / displayScale;
    const deltaY = (event.clientY - drag.startY) / displayScale;
    setCrop(resizeCrop(drag.startCrop, rotatedSize, drag.handle, deltaX, deltaY, aspectRatio));
  }

  function stopDrag(event: PointerEvent) {
    activePointersRef.current.delete(event.pointerId);
    if (frameRef.current?.hasPointerCapture(event.pointerId)) frameRef.current.releasePointerCapture(event.pointerId);
    if (activePointersRef.current.size < 2) pinchRef.current = null;
    if (activePointersRef.current.size === 0) dragRef.current = null;
  }

  async function applyCrop() {
    const image = imageRef.current;
    if (!image || !crop || !rotatedSize) return;
    setIsApplying(true);
    setError("");
    try {
      const safeCrop = clampCrop(crop, rotatedSize, aspectRatio);
      const croppedFile = await rotateAndCropImage(file, image, safeCrop, rotation);
      onApply(croppedFile);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo aplicar el recorte.");
    } finally {
      setIsApplying(false);
    }
  }

  async function applyWithoutCrop() {
    const image = imageRef.current;
    if (!image) return;
    setIsApplying(true);
    setError("");
    try {
      const outputFile = await rotateWholeImage(file, image, rotation);
      onApply(outputFile);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo exportar la imagen.");
    } finally {
      setIsApplying(false);
    }
  }

  const cropStyle = crop ? {
    left: `${crop.x * displayScale}px`,
    top: `${crop.y * displayScale}px`,
    width: `${crop.width * displayScale}px`,
    height: `${crop.height * displayScale}px`,
  } : undefined;

  return (
    <div className="inline-dialog-backdrop">
      <section className="image-crop-dialog" role="dialog" aria-modal="true" aria-labelledby="image-crop-title">
        <header className="image-crop-header">
          <Button type="button" variant="ghost" className="image-crop-header-button image-crop-cancel-top" onClick={onCancel} disabled={isApplying}>
            <X className="size-4" aria-hidden={true} />
            Cancelar
          </Button>
          <div className="image-crop-title">
            <p>{cropSubtitle}</p>
            <h3 id="image-crop-title">{cropTitle}</h3>
          </div>
          <Button type="button" variant="ghost" className="image-crop-header-button image-crop-close-top" onClick={onCancel} disabled={isApplying} aria-label="Cerrar editor de recorte">
            <X className="size-5" aria-hidden={true} />
          </Button>
          <Button type="button" className="image-crop-header-button image-crop-apply-top" onClick={() => void applyCrop()} disabled={!crop || !imageSize || isApplying}>
            <LoaderCircle className={`size-4 ${isApplying ? "animate-spin" : "hidden"}`} aria-hidden={true} />
            <Check className={`size-4 ${isApplying ? "hidden" : ""}`} aria-hidden={true} />
            Listo
          </Button>
        </header>

        <div className="image-crop-layout">
          <div className="image-crop-stage" aria-busy={!imageSize}>
            {error ? null : (
              <div
                className="image-crop-frame"
                ref={frameRef}
                style={{ width: displaySize.width, height: displaySize.height }}
                onPointerDown={(event) => startDrag(event, "move")}
                onPointerMove={moveDrag}
                onPointerUp={stopDrag}
                onPointerCancel={stopDrag}
                role="application"
                aria-label="Editor tactil de recorte. Arrastra para mover el area de recorte y usa dos dedos para acercar o alejar."
              >
                <canvas ref={canvasRef} aria-label="Imagen a recortar" />
                {crop && <div className="image-crop-selection" style={cropStyle} onPointerDown={(event) => startDrag(event, "move")} aria-label="Area de recorte">
                  {handles.map((handle) => <button key={handle.value} type="button" className={`image-crop-handle is-${handle.value}`} aria-label={handle.label} onPointerDown={(event) => startDrag(event, handle.value)} />)}
                </div>}
              </div>
            )}
            {!imageSize && !error ? <div className="loading-row" role="status"><LoaderCircle className="size-4 animate-spin" />Cargando imagen...</div> : null}
          </div>

          <aside className="image-crop-controls" aria-label="Controles de recorte">
            <div className="crop-control-group crop-zoom-control">
              <div className="crop-control-row">
                <span className="crop-control-title">Zoom</span>
                <strong>{zoomPercent}%</strong>
              </div>
              <div className="crop-zoom-row">
                <Button type="button" variant="ghost" size="icon" aria-label="Alejar imagen" onClick={() => setZoom(zoomValue - 0.25)} disabled={!crop || isApplying}>
                  <Minus className="size-4" aria-hidden={true} />
                </Button>
                <input
                  type="range"
                  min={minCropZoom}
                  max={maxCropZoom}
                  step="0.05"
                  value={zoomValue}
                  aria-label="Zoom de recorte"
                  aria-valuetext={`${zoomPercent}%`}
                  disabled={!crop || isApplying}
                  onChange={(event) => setZoom(Number(event.target.value))}
                />
                <Button type="button" variant="ghost" size="icon" aria-label="Acercar imagen" onClick={() => setZoom(zoomValue + 0.25)} disabled={!crop || isApplying}>
                  <Plus className="size-4" aria-hidden={true} />
                </Button>
              </div>
              <p className="crop-helper">Arrastra con un dedo. Pellizca con dos dedos para acercar o alejar.</p>
            </div>

            <div className="crop-control-group">
              <span className="crop-control-title">Orientacion</span>
              <div className="segmented-actions">
                <Button type="button" variant="ghost" onClick={() => rotate(rotateLeft(rotation))} disabled={!imageSize || isApplying}><RotateCcw className="mr-2 size-4" />Izquierda</Button>
                <Button type="button" variant="ghost" onClick={() => rotate(rotateRight(rotation))} disabled={!imageSize || isApplying}><RotateCw className="mr-2 size-4" />Derecha</Button>
              </div>
            </div>

            <div className="crop-control-group">
              <span className="crop-control-title">Formato</span>
              <div className="crop-aspect-options">
                {(["free", "1:1", "4:3"] as CropAspect[]).map((option) => (
                  <button key={option} type="button" className={aspectRatio === option ? "is-active" : ""} onClick={() => changeAspect(option)} disabled={!crop || isApplying}>
                    {option === "free" ? "Libre" : option}
                  </button>
                ))}
              </div>
            </div>

            <div className="crop-control-group">
              <span className="crop-control-title">Dimensiones</span>
              <div className="crop-dimensions" aria-live="polite">
                <span>Ancho <strong>{crop ? Math.round(crop.width) : 0}px</strong></span>
                <span>Alto <strong>{crop ? Math.round(crop.height) : 0}px</strong></span>
                <span>Rotacion <strong>{rotation}°</strong></span>
              </div>
            </div>

            <div className="crop-control-group">
              <div className="segmented-actions">
                <Button type="button" variant="ghost" onClick={resetEditor} disabled={!imageSize || isApplying}><Undo2 className="mr-2 size-4" />Restablecer</Button>
                <Button type="button" variant="ghost" onClick={() => rotatedSize && setCrop(fullCrop(rotatedSize))} disabled={!rotatedSize || isApplying}><Maximize2 className="mr-2 size-4" />Todo</Button>
              </div>
            </div>
          </aside>
        </div>

        {error ? <p className="studio-error" role="alert">{error}</p> : null}
        {isApplying ? <p className="crop-processing" role="status"><LoaderCircle className="size-4 animate-spin" aria-hidden={true} />Procesando imagen...</p> : null}

        <div className="inline-dialog-actions image-crop-actions">
          <Button type="button" variant="ghost" onClick={() => void applyWithoutCrop()} disabled={!imageSize || isApplying}>
            <Maximize2 className="mr-2 size-4" />Sin recorte
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel} disabled={isApplying}>
            Cancelar
          </Button>
          <Button type="button" onClick={() => void applyCrop()} disabled={!crop || !imageSize || isApplying}>
            <LoaderCircle className={`mr-2 size-4 ${isApplying ? "animate-spin" : "hidden"}`} />
            <Check className={`mr-2 size-4 ${isApplying ? "hidden" : ""}`} />
            Aplicar recorte
          </Button>
        </div>
      </section>
    </div>
  );
}

function fitInto(size: ImageDimensions, bounds: ImageDimensions): ImageDimensions {
  const scale = Math.min(bounds.width / size.width, bounds.height / size.height, 1);
  return { width: Math.max(1, size.width * scale), height: Math.max(1, size.height * scale) };
}

function distanceBetween(first: PointerPoint, second: PointerPoint) {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

function formatContextName(value: string) {
  const normalized = value.trim().replace(/\s+/g, " ").toLocaleLowerCase("es-PE");
  return normalized.replace(/(^|\s)(dni|pdf|docx?|ruc)(?=\s|$)/gi, (match) => match.toLocaleUpperCase("es-PE"));
}

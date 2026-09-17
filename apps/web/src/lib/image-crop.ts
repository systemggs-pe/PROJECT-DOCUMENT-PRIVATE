export type CropAspect = "free" | "1:1" | "4:3";
export type Rotation = 0 | 90 | 180 | 270;

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ImageDimensions {
  width: number;
  height: number;
}

export const minimumCropSize = 24;

export function normalizeRotation(rotation: number): Rotation {
  const normalized = ((rotation % 360) + 360) % 360;
  return (normalized === 90 || normalized === 180 || normalized === 270 ? normalized : 0) as Rotation;
}

export function rotateLeft(rotation: Rotation): Rotation {
  return normalizeRotation(rotation - 90);
}

export function rotateRight(rotation: Rotation): Rotation {
  return normalizeRotation(rotation + 90);
}

export function calculateRotatedDimensions(size: ImageDimensions, rotation: Rotation): ImageDimensions {
  return rotation === 90 || rotation === 270 ? { width: size.height, height: size.width } : size;
}

export function aspectRatioValue(aspect: CropAspect): number | null {
  if (aspect === "1:1") return 1;
  if (aspect === "4:3") return 4 / 3;
  return null;
}

export function initialCrop(size: ImageDimensions, aspect: CropAspect = "free"): CropRect {
  const ratio = aspectRatioValue(aspect);
  const inset = 0.08;
  let width = Math.max(minimumCropSize, size.width * (1 - inset * 2));
  let height = Math.max(minimumCropSize, size.height * (1 - inset * 2));
  if (ratio) {
    if (width / height > ratio) width = height * ratio;
    else height = width / ratio;
  }
  return clampCrop({ x: (size.width - width) / 2, y: (size.height - height) / 2, width, height }, size, aspect);
}

export function fullCrop(size: ImageDimensions): CropRect {
  return { x: 0, y: 0, width: size.width, height: size.height };
}

export function clampCrop(crop: CropRect, bounds: ImageDimensions, aspect: CropAspect = "free"): CropRect {
  const ratio = aspectRatioValue(aspect);
  let width = clampFinite(crop.width, minimumCropSize, bounds.width);
  let height = clampFinite(crop.height, minimumCropSize, bounds.height);

  if (ratio) {
    const centered = applyAspectAroundCenter({ ...crop, width, height }, bounds, aspect);
    width = centered.width;
    height = centered.height;
  }

  const x = clampFinite(crop.x, 0, Math.max(0, bounds.width - width));
  const y = clampFinite(crop.y, 0, Math.max(0, bounds.height - height));
  return { x, y, width, height };
}

export function applyAspectAroundCenter(crop: CropRect, bounds: ImageDimensions, aspect: CropAspect): CropRect {
  const ratio = aspectRatioValue(aspect);
  if (!ratio) return clampCrop(crop, bounds, "free");

  const centerX = crop.x + crop.width / 2;
  const centerY = crop.y + crop.height / 2;
  let width = Math.min(crop.width, bounds.width);
  let height = width / ratio;

  if (height > bounds.height) {
    height = bounds.height;
    width = height * ratio;
  }

  if (width < minimumCropSize || height < minimumCropSize) {
    width = Math.min(bounds.width, Math.max(minimumCropSize, width));
    height = width / ratio;
    if (height > bounds.height) {
      height = Math.min(bounds.height, Math.max(minimumCropSize, height));
      width = height * ratio;
    }
  }

  return clampCrop({ x: centerX - width / 2, y: centerY - height / 2, width, height }, bounds, "free");
}

export function moveCrop(crop: CropRect, bounds: ImageDimensions, deltaX: number, deltaY: number): CropRect {
  return clampCrop({ ...crop, x: crop.x + deltaX, y: crop.y + deltaY }, bounds, "free");
}

export type CropHandle = "move" | "top-left" | "top" | "top-right" | "right" | "bottom-right" | "bottom" | "bottom-left" | "left";

export function resizeCrop(crop: CropRect, bounds: ImageDimensions, handle: CropHandle, deltaX: number, deltaY: number, aspect: CropAspect): CropRect {
  if (handle === "move") return moveCrop(crop, bounds, deltaX, deltaY);

  let left = crop.x;
  let top = crop.y;
  let right = crop.x + crop.width;
  let bottom = crop.y + crop.height;

  if (handle.includes("left")) left += deltaX;
  if (handle.includes("right")) right += deltaX;
  if (handle.includes("top")) top += deltaY;
  if (handle.includes("bottom")) bottom += deltaY;

  left = clampFinite(left, 0, right - minimumCropSize);
  top = clampFinite(top, 0, bottom - minimumCropSize);
  right = clampFinite(right, left + minimumCropSize, bounds.width);
  bottom = clampFinite(bottom, top + minimumCropSize, bounds.height);

  const next = { x: left, y: top, width: right - left, height: bottom - top };
  const ratio = aspectRatioValue(aspect);
  if (!ratio) return clampCrop(next, bounds, "free");

  const fixed = fixedPointForHandle(crop, handle);
  const desiredWidth = next.width;
  const desiredHeight = next.height;
  if (desiredWidth / desiredHeight > ratio) next.width = desiredHeight * ratio;
  else next.height = desiredWidth / ratio;

  if (handle.includes("left")) next.x = fixed.x - next.width;
  else if (!handle.includes("right")) next.x = fixed.x - next.width / 2;
  if (handle.includes("top")) next.y = fixed.y - next.height;
  else if (!handle.includes("bottom")) next.y = fixed.y - next.height / 2;

  return clampCrop(next, bounds, aspect);
}

export function getOutputMimeType(file: File): "image/jpeg" | "image/png" | "image/webp" {
  return file.type === "image/png" || file.type === "image/webp" || file.type === "image/jpeg" ? file.type : "image/jpeg";
}

export function getExtensionFromMime(mimeType: string): "jpg" | "png" | "webp" {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  return "jpg";
}

export function replaceFileExtension(name: string, mimeType: string) {
  const extension = getExtensionFromMime(mimeType);
  const baseName = name.replace(/\.[^.]+$/, "").trim() || "imagen";
  return `${baseName}.${extension}`;
}

export async function rotateAndCropImage(file: File, image: HTMLImageElement, crop: CropRect, rotation: Rotation): Promise<File> {
  const rotatedCanvas = renderRotatedImage(image, rotation);
  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = Math.max(1, Math.round(crop.width));
  outputCanvas.height = Math.max(1, Math.round(crop.height));
  const context = outputCanvas.getContext("2d");
  if (!context) throw new Error("No se pudo preparar el recorte.");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(
    rotatedCanvas,
    Math.round(crop.x),
    Math.round(crop.y),
    Math.round(crop.width),
    Math.round(crop.height),
    0,
    0,
    outputCanvas.width,
    outputCanvas.height,
  );
  return canvasToFile(outputCanvas, file, getOutputMimeType(file));
}

export async function rotateWholeImage(file: File, image: HTMLImageElement, rotation: Rotation): Promise<File> {
  if (rotation === 0) return file;
  return canvasToFile(renderRotatedImage(image, rotation), file, getOutputMimeType(file));
}

export function renderRotatedImage(image: HTMLImageElement, rotation: Rotation): HTMLCanvasElement {
  const source = { width: image.naturalWidth, height: image.naturalHeight };
  const target = calculateRotatedDimensions(source, rotation);
  const canvas = document.createElement("canvas");
  canvas.width = target.width;
  canvas.height = target.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("No se pudo preparar la imagen.");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";

  if (rotation === 90) {
    context.translate(target.width, 0);
    context.rotate(Math.PI / 2);
  } else if (rotation === 180) {
    context.translate(target.width, target.height);
    context.rotate(Math.PI);
  } else if (rotation === 270) {
    context.translate(0, target.height);
    context.rotate(-Math.PI / 2);
  }

  context.drawImage(image, 0, 0);
  return canvas;
}

export async function canvasToFile(canvas: HTMLCanvasElement, originalFile: File, requestedMimeType: string): Promise<File> {
  const fallbackMime = "image/jpeg";
  const blob = await canvasToBlob(canvas, requestedMimeType);
  const mimeType = blob.type === "image/png" || blob.type === "image/webp" || blob.type === "image/jpeg" ? blob.type : fallbackMime;
  const normalizedBlob = mimeType === blob.type ? blob : await canvasToBlob(canvas, fallbackMime);
  return new File([normalizedBlob], replaceFileExtension(originalFile.name, mimeType), { type: mimeType, lastModified: Date.now() });
}

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("No se pudo exportar la imagen.")), mimeType, mimeType === "image/jpeg" || mimeType === "image/webp" ? 0.95 : undefined);
  });
}

function fixedPointForHandle(crop: CropRect, handle: CropHandle) {
  const left = crop.x;
  const right = crop.x + crop.width;
  const top = crop.y;
  const bottom = crop.y + crop.height;
  const centerX = crop.x + crop.width / 2;
  const centerY = crop.y + crop.height / 2;

  return {
    x: handle.includes("left") ? right : handle.includes("right") ? left : centerX,
    y: handle.includes("top") ? bottom : handle.includes("bottom") ? top : centerY,
  };
}

function clampFinite(value: number, min: number, max: number) {
  const normalized = Number.isFinite(value) ? value : min;
  return Math.min(max, Math.max(min, normalized));
}

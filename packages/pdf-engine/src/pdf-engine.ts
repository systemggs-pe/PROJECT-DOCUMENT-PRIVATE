import type {
  DocumentDefinition,
  ElementDefinition,
  ImageFitMode,
  PageDefinition,
} from "@ggs/types";
import PDFDocument from "pdfkit";

const POINTS_PER_INCH = 72;
const MILLIMETERS_PER_INCH = 25.4;
const MAX_PAGES = 20;
const MAX_ELEMENTS_PER_PAGE = 100;
const MAX_ASSET_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_ASSET_BYTES = 30 * 1024 * 1024;
const MAX_PDF_BYTES = 30 * 1024 * 1024;
const MAX_TEXT_LENGTH = 2000;
const MAX_PAGE_POINTS = 2000;
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export const PAPER_SIZE_POINTS = {
  A4: { width: mmToPoints(210), height: mmToPoints(297) },
  A5: { width: mmToPoints(148), height: mmToPoints(210) },
  LETTER: { width: 8.5 * POINTS_PER_INCH, height: 11 * POINTS_PER_INCH },
  LEGAL: { width: 8.5 * POINTS_PER_INCH, height: 14 * POINTS_PER_INCH },
} as const;

export interface PdfRenderResult {
  content: Uint8Array;
  contentType: "application/pdf";
  fileName?: string;
}

export type PdfRenderInput = DocumentDefinition;

export interface PdfEngine {
  render(input: PdfRenderInput): Promise<Buffer>;
}

export interface PdfEngineOptions {
  defaultAuthor?: string;
}

export class PdfEngineError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class UnsupportedPaperSizeError extends PdfEngineError {
  constructor(paperSize: string) {
    super(`Unsupported paper size: ${paperSize}`, "UNSUPPORTED_PAPER_SIZE");
  }
}

export class UnsupportedElementTypeError extends PdfEngineError {
  constructor(type: string) {
    super(`Unsupported element type: ${type}`, "UNSUPPORTED_ELEMENT_TYPE");
  }
}

export class InvalidElementError extends PdfEngineError {
  constructor(message: string) {
    super(message, "INVALID_ELEMENT");
  }
}

export class UnsupportedImageFormatError extends PdfEngineError {
  constructor(contentType: string) {
    super(`Unsupported image format: ${contentType}`, "UNSUPPORTED_IMAGE_FORMAT");
  }
}

export class MissingImageAssetError extends PdfEngineError {
  constructor(key: string) {
    super(`Missing image asset: ${key}`, "MISSING_IMAGE_ASSET");
  }
}

export class FontError extends PdfEngineError {
  constructor(fontFamily: string) {
    super(`Unsupported font family: ${fontFamily}`, "UNSUPPORTED_FONT");
  }
}

export class PdfRenderError extends PdfEngineError {
  constructor(message = "PDF rendering failed") {
    super(message, "PDF_RENDER_ERROR");
  }
}

export function mmToPoints(millimeters: number): number {
  return (millimeters / MILLIMETERS_PER_INCH) * POINTS_PER_INCH;
}

export function getPaperDimensions(
  paperSize: DocumentDefinition["pageSize"],
  orientation: DocumentDefinition["orientation"],
) {
  if (paperSize === "CUSTOM") return undefined;
  const dimensions = PAPER_SIZE_POINTS[paperSize];
  if (!dimensions) throw new UnsupportedPaperSizeError(paperSize);
  return orientation === "LANDSCAPE"
    ? { width: dimensions.height, height: dimensions.width }
    : dimensions;
}

/** PDFKit's public drawing API already uses the editor's top-left coordinate system. */
export function editorToPdfCoordinates(
  _page: Pick<PageDefinition, "width" | "height">,
  rect: Pick<ElementDefinition, "x" | "y" | "width" | "height">,
) {
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
}

export class PdfKitEngine implements PdfEngine {
  private readonly options: PdfEngineOptions;

  constructor(options: PdfEngineOptions = {}) {
    this.options = options;
  }

  async render(input: PdfRenderInput): Promise<Buffer> {
    validateDocument(input);
    const pdf = new PDFDocument({
      autoFirstPage: false,
      compress: true,
      info: {
        Title: input.metadata?.title ?? "GGS Document Studio",
        Creator: "GGS Document Studio",
        Producer: "GGS Document Studio PDF Engine",
        CreationDate: new Date(0),
        ...(input.metadata?.author ?? this.options.defaultAuthor
          ? { Author: input.metadata?.author ?? this.options.defaultAuthor }
          : {}),
      },
    });
    const chunks: Buffer[] = [];

    return new Promise<Buffer>((resolve, reject) => {
      let outputBytes = 0;
      let settled = false;
      const fail = (error: unknown) => {
        if (settled) return;
        settled = true;
        reject(error instanceof PdfEngineError ? error : new PdfRenderError());
      };

      pdf.on("data", (chunk: Buffer) => {
        outputBytes += chunk.length;
        if (outputBytes > MAX_PDF_BYTES) {
          pdf.destroy(new PdfRenderError("Rendered PDF exceeds the 30 MB limit"));
          return;
        }
        chunks.push(chunk);
      });
      pdf.on("error", fail);
      pdf.on("end", () => {
        if (!settled) {
          settled = true;
          resolve(Buffer.concat(chunks));
        }
      });

      try {
        const assets = new Map(input.assets.map((asset) => [asset.key, asset]));
        for (const page of input.pages) {
          pdf.addPage({ size: [page.width, page.height], margin: 0 });
          const orderedElements = [...page.elements].sort(
            (left, right) => left.zIndex - right.zIndex || left.id.localeCompare(right.id),
          );
          for (const element of orderedElements) renderElement(pdf, page, element, assets);
        }
        pdf.end();
      } catch (error) {
        pdf.destroy(error instanceof Error ? error : new PdfRenderError());
      }
    });
  }

  async generate(input: PdfRenderInput): Promise<PdfRenderResult> {
    return { content: await this.render(input), contentType: "application/pdf" };
  }
}

function validateDocument(input: PdfRenderInput): void {
  if (!input || typeof input !== "object") throw new PdfRenderError("Document input is required");
  if (!Array.isArray(input.pages) || input.pages.length < 1 || input.pages.length > MAX_PAGES) {
    throw new PdfRenderError("Document must have 1 to 20 pages");
  }
  if (!Array.isArray(input.assets)) throw new PdfRenderError("Document assets must be an array");
  if (!(input.pageSize in { A4: true, A5: true, LETTER: true, LEGAL: true, CUSTOM: true })) {
    throw new UnsupportedPaperSizeError(String(input.pageSize));
  }
  if (input.orientation !== "PORTRAIT" && input.orientation !== "LANDSCAPE") {
    throw new PdfRenderError(`Unsupported orientation: ${String(input.orientation)}`);
  }

  const assetKeys = new Set<string>();
  let totalAssetBytes = 0;
  for (const asset of input.assets) {
    if (!asset || typeof asset.key !== "string" || asset.key.length < 1 || asset.key.length > 120) {
      throw new PdfRenderError("Asset keys must be non-empty and bounded");
    }
    if (assetKeys.has(asset.key)) throw new PdfRenderError(`Duplicate asset key: ${asset.key}`);
    assetKeys.add(asset.key);
    if (!(asset.data instanceof Uint8Array) || asset.data.byteLength === 0) throw new PdfRenderError(`Asset ${asset.key} must contain binary data`);
    if (asset.data.byteLength > MAX_ASSET_BYTES) throw new PdfRenderError(`Asset ${asset.key} exceeds the 10 MB limit`);
    totalAssetBytes += asset.data.byteLength;
    if (totalAssetBytes > MAX_TOTAL_ASSET_BYTES) throw new PdfRenderError("Document assets exceed the 30 MB limit");
    validateImageAsset(asset.contentType, asset.data, asset.key);
  }

  input.pages.forEach((page, pageIndex) => {
    if (!page || page.pageNumber !== pageIndex + 1) throw new PdfRenderError("Pages must be sequentially numbered");
    assertFinitePositive(page.width, "page width");
    assertFinitePositive(page.height, "page height");
    if (page.width > MAX_PAGE_POINTS || page.height > MAX_PAGE_POINTS) throw new PdfRenderError("Page dimensions exceed the supported limit");
    const expected = getPaperDimensions(input.pageSize, input.orientation);
    if (expected && (Math.abs(expected.width - page.width) > 1 || Math.abs(expected.height - page.height) > 1)) throw new PdfRenderError("Page dimensions do not match paper size and orientation");
    if (!Array.isArray(page.elements) || page.elements.length > MAX_ELEMENTS_PER_PAGE) throw new PdfRenderError("Page contains too many elements");
    page.elements.forEach((element) => validateElement(element, page));
  });
}

function validateElement(element: ElementDefinition, page: PageDefinition): void {
  if (!element || typeof element !== "object") throw new InvalidElementError("Element must be an object");
  if (!["IMAGE", "TEXT", "RECTANGLE", "LINE"].includes(element.type)) throw new UnsupportedElementTypeError(String(element.type));
  if (!Number.isInteger(element.zIndex) || element.zIndex < 0 || element.zIndex > 10000) throw new InvalidElementError(`${element.id}: invalid z-index`);
  if (!Number.isInteger(element.page) || element.page !== page.pageNumber) throw new InvalidElementError(`${element.id}: invalid page`);
  assertFiniteNonNegative(element.x, `${element.id}: x`);
  assertFiniteNonNegative(element.y, `${element.id}: y`);
  assertFinitePositive(element.width, `${element.id}: width`);
  assertFinitePositive(element.height, `${element.id}: height`);
  if (!Number.isFinite(element.rotation) || element.rotation < -360 || element.rotation > 360) throw new InvalidElementError(`${element.id}: invalid rotation`);
  if (!Number.isFinite(element.x + element.width) || !Number.isFinite(element.y + element.height)) throw new InvalidElementError(`${element.id}: invalid bounds`);
  if (element.x > page.width || element.y > page.height) throw new InvalidElementError(`${element.id}: outside page`);

  if (element.type === "IMAGE") {
    if (!element.key) throw new InvalidElementError(`${element.id}: image key is required`);
    const properties = element.properties;
    if (!properties || !["contain", "cover", "stretch", "fill"].includes(properties.fitMode)) throw new InvalidElementError(`${element.id}: invalid image fit`);
    if (properties.borderColor) assertColor(properties.borderColor, `${element.id}: border color`);
    assertFiniteRange(properties.borderWidth ?? 0, 0, 20, `${element.id}: border width`);
    assertFiniteRange(properties.borderRadius ?? 0, 0, Math.min(element.width, element.height) / 2, `${element.id}: border radius`);
  } else if (element.type === "TEXT") {
    const properties = element.properties;
    if (!properties || typeof properties.text !== "string" || properties.text.length > MAX_TEXT_LENGTH) throw new InvalidElementError(`${element.id}: invalid text`);
    assertFiniteRange(properties.fontSize, 1, 200, `${element.id}: font size`);
    if (properties.color) assertColor(properties.color, `${element.id}: text color`);
    if (properties.textAlign && !["left", "center", "right", "justify"].includes(properties.textAlign)) throw new InvalidElementError(`${element.id}: invalid text alignment`);
    resolveFont(properties.fontFamily, properties.fontWeight);
  } else if (element.type === "RECTANGLE") {
    const properties = element.properties;
    if (!properties) throw new InvalidElementError(`${element.id}: rectangle properties are required`);
    if (properties.fill) assertColor(properties.fill, `${element.id}: fill`);
    if (properties.stroke) assertColor(properties.stroke, `${element.id}: stroke`);
    assertFiniteRange(properties.strokeWidth ?? 0, 0, 20, `${element.id}: stroke width`);
    assertFiniteRange(properties.borderRadius ?? 0, 0, Math.min(element.width, element.height) / 2, `${element.id}: border radius`);
  } else {
    const properties = element.properties;
    if (!properties) throw new InvalidElementError(`${element.id}: line properties are required`);
    assertColor(properties.stroke, `${element.id}: line color`);
    assertFiniteRange(properties.strokeWidth ?? 1, 0.1, 20, `${element.id}: line width`);
  }
}

function renderElement(
  pdf: InstanceType<typeof PDFDocument>,
  page: PageDefinition,
  element: ElementDefinition,
  assets: Map<string, { key: string; contentType: string; data: Uint8Array }>,
): void {
  const rect = editorToPdfCoordinates(page, element);
  pdf.save().rotate(element.rotation, { origin: [rect.x + rect.width / 2, rect.y + rect.height / 2] });
  try {
    if (element.type === "IMAGE") renderImage(pdf, element, rect, assets);
    else if (element.type === "TEXT") renderText(pdf, element, rect);
    else if (element.type === "RECTANGLE") renderRectangle(pdf, element, rect);
    else if (element.type === "LINE") renderLine(pdf, element, rect);
  } finally {
    pdf.restore();
  }
}

function renderImage(
  pdf: InstanceType<typeof PDFDocument>,
  element: Extract<ElementDefinition, { type: "IMAGE" }>,
  rect: { x: number; y: number; width: number; height: number },
  assets: Map<string, { key: string; contentType: string; data: Uint8Array }>,
): void {
  const asset = assets.get(element.assetKey ?? element.key);
  if (!asset) {
    if (element.required) throw new MissingImageAssetError(element.key);
    return;
  }
  const radius = Math.min(element.properties.borderRadius ?? 0, rect.width / 2, rect.height / 2);
  const imageData = toBuffer(asset.data);
  pdf.save();
  drawRoundedPath(pdf, rect, radius).clip();
  const fit = normalizeFitMode(element.properties.fitMode);
  if (fit === "fill") pdf.image(imageData, rect.x, rect.y, { width: rect.width, height: rect.height });
  else if (fit === "cover") pdf.image(imageData, rect.x, rect.y, { cover: [rect.width, rect.height], align: "center", valign: "center" });
  else pdf.image(imageData, rect.x, rect.y, { fit: [rect.width, rect.height], align: "center", valign: "center" });
  pdf.restore();
}

function renderText(
  pdf: InstanceType<typeof PDFDocument>,
  element: Extract<ElementDefinition, { type: "TEXT" }>,
  rect: { x: number; y: number; width: number; height: number },
): void {
  const properties = element.properties;
  pdf.save();
  pdf.rect(rect.x, rect.y, rect.width, rect.height).clip();
  pdf.font(resolveFont(properties.fontFamily, properties.fontWeight)).fontSize(properties.fontSize).fillColor(properties.color ?? "#000000");
  pdf.text(properties.text, rect.x, rect.y, {
    width: rect.width,
    height: rect.height,
    align: properties.textAlign ?? "left",
    lineGap: 0,
    ellipsis: true,
  });
  pdf.restore();
}

function renderRectangle(
  pdf: InstanceType<typeof PDFDocument>,
  element: Extract<ElementDefinition, { type: "RECTANGLE" }>,
  rect: { x: number; y: number; width: number; height: number },
): void {
  const properties = element.properties;
  const radius = Math.min(properties.borderRadius ?? 0, rect.width / 2, rect.height / 2);
  if (properties.fill) drawRoundedPath(pdf, rect, radius).fill(properties.fill);
  if (properties.stroke && (properties.strokeWidth ?? 0) > 0) drawRoundedPath(pdf, rect, radius).lineWidth(properties.strokeWidth ?? 1).strokeColor(properties.stroke).stroke();
}

function renderLine(
  pdf: InstanceType<typeof PDFDocument>,
  element: Extract<ElementDefinition, { type: "LINE" }>,
  rect: { x: number; y: number; width: number; height: number },
): void {
  pdf.lineWidth(element.properties.strokeWidth ?? 1).strokeColor(element.properties.stroke).moveTo(rect.x, rect.y).lineTo(rect.x + rect.width, rect.y + rect.height).stroke();
}

function drawRoundedPath(pdf: InstanceType<typeof PDFDocument>, rect: { x: number; y: number; width: number; height: number }, radius: number) {
  return radius > 0 ? pdf.roundedRect(rect.x, rect.y, rect.width, rect.height, radius) : pdf.rect(rect.x, rect.y, rect.width, rect.height);
}

function validateImageAsset(contentType: string, data: Uint8Array, key: string): void {
  if (contentType === "image/webp") throw new UnsupportedImageFormatError(contentType);
  if (contentType !== "image/jpeg" && contentType !== "image/png") throw new UnsupportedImageFormatError(contentType);
  const jpeg = data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
  const png = data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47 && data[4] === 0x0d && data[5] === 0x0a && data[6] === 0x1a && data[7] === 0x0a;
  if ((contentType === "image/jpeg" && !jpeg) || (contentType === "image/png" && !png)) throw new UnsupportedImageFormatError(`${contentType} (${key})`);
}

function normalizeFitMode(value: ImageFitMode | "fill"): "contain" | "cover" | "fill" {
  return value === "stretch" || value === "fill" ? "fill" : value;
}

function resolveFont(fontFamily = "Helvetica", fontWeight = "400"): string {
  const normalized = fontFamily.trim().toLowerCase();
  const base = normalized === "times" || normalized === "times new roman" ? "Times" : normalized === "courier" ? "Courier" : normalized === "helvetica" || normalized === "arial" || normalized === "inter" || normalized === "sans-serif" ? "Helvetica" : undefined;
  if (!base) throw new FontError(fontFamily);
  if (base === "Times") return isBold(fontWeight) ? "Times-Bold" : "Times-Roman";
  if (base === "Courier") return isBold(fontWeight) ? "Courier-Bold" : "Courier";
  return isBold(fontWeight) ? "Helvetica-Bold" : "Helvetica";
}

function isBold(fontWeight: string): boolean {
  return fontWeight === "bold" || fontWeight === "700" || fontWeight === "600";
}

function toBuffer(data: Uint8Array): Buffer {
  return Buffer.isBuffer(data) ? data : Buffer.from(data);
}

function assertColor(value: string, label: string): void {
  if (!HEX_COLOR.test(value)) throw new InvalidElementError(`${label} must be a #RRGGBB color`);
}

function assertFinitePositive(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) throw new InvalidElementError(`${label} must be positive and finite`);
}

function assertFiniteNonNegative(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) throw new InvalidElementError(`${label} must be non-negative and finite`);
}

function assertFiniteRange(value: number, min: number, max: number, label: string): void {
  if (!Number.isFinite(value) || value < min || value > max) throw new InvalidElementError(`${label} is outside the supported range`);
}

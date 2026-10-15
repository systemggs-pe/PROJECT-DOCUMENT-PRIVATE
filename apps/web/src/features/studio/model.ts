export interface ElementProperties {
  fitMode: "contain" | "cover" | "stretch"; border: boolean; borderWidth: number; borderRadius: number;
  text: string; fontSize: number; fontFamily: string; fontWeight: "400" | "500" | "600" | "700"; textAlign: "left" | "center" | "right";
  color: string; fill: string; stroke: string; strokeWidth: number;
  fileRenderMode: "ATTACH" | "PLACE"; acceptedMimeTypes: string[]; maxFiles: number; maxSizeBytes: number;
}
export interface StudioElement {
  id: string; type: "IMAGE" | "FILE" | "TEXT" | "RECTANGLE" | "LINE"; fileFieldId?: string | null; name: string; key: string | null;
  page: number; x: number; y: number; width: number; height: number; rotation: number; zIndex: number; required: boolean;
  properties: ElementProperties;
}
export interface Draft {
  name: string; description: string; paperSize: "A4" | "A5" | "LETTER" | "LEGAL" | "CUSTOM";
  orientation: "PORTRAIT" | "LANDSCAPE"; width: number; height: number;
  marginTop: number; marginRight: number; marginBottom: number; marginLeft: number; pageCount: number;
  elements: StudioElement[]; expectedVersion?: number;
}
export interface Version extends Omit<Draft, "name" | "description"> { id: string; templateId: string; versionNumber: number; isActive: boolean; createdAt?: string }
export interface Template { id: string; name: string; description: string | null; status: "ACTIVE" | "DRAFT" | "ARCHIVED"; createdAt?: string; updatedAt?: string; versions: Version[]; activeVersion?: Version | null }
export interface TemplatePage { items: Template[]; page: number; pageSize: number; total: number; totalPages: number }
export interface GenerationFile { id: string; originalName: string; mimeType: string; sizeBytes: string; type?: "IMAGE" | "PDF" | "DOCUMENT"; createdAt?: string }
export interface GenerationInput { id: string; key: string; value: unknown; fileId: string | null; templateElement: { id: string; name: string; key: string | null; type: string }; file: GenerationFile | null }
export interface Generation { id: string; number: string; status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED"; outputFileId: string | null; createdAt: string; errorMessage: string | null; template?: { id?: string; name: string }; templateVersion?: { id?: string; versionNumber: number; paperSize?: string; orientation?: string; pageCount?: number }; outputFile?: GenerationFile | null; inputs?: GenerationInput[]; snapshot?: { name?: string } }
export interface GenerationPage { items: Generation[]; page: number; pageSize: number; total: number; totalPages: number }
export const properties: ElementProperties = { fitMode: "contain", border: false, borderWidth: 1, borderRadius: 0, text: "Texto", fontSize: 12, fontFamily: "Inter", fontWeight: "400", textAlign: "left", color: "#17211c", fill: "#eef2f4", stroke: "#63716a", strokeWidth: 1, fileRenderMode: "ATTACH", acceptedMimeTypes: ["application/pdf"], maxFiles: 1, maxSizeBytes: 3 * 1024 * 1024 };
export const paperSizes = { A4: [595.28, 841.89], A5: [419.53, 595.28], LETTER: [612, 792], LEGAL: [612, 1008] } as const;
export function newElement(type: StudioElement["type"], index: number, page = 1): StudioElement {
  return { id: crypto.randomUUID(), type, fileFieldId: null, name: type === "IMAGE" ? "Imagen" : type === "FILE" ? "Archivo" : type === "TEXT" ? "Texto" : type === "LINE" ? "Linea" : "Rectangulo", key: type === "IMAGE" || type === "FILE" ? `${type === "IMAGE" ? "imagen" : "archivo"}_${crypto.randomUUID().replaceAll("-", "").slice(0, 10)}` : null, page, x: 40, y: 40, width: type === "FILE" ? 220 : 150, height: type === "LINE" ? 2 : type === "TEXT" ? 32 : type === "FILE" ? 160 : 100, rotation: 0, zIndex: index, required: type === "IMAGE" || type === "FILE", properties: { ...properties } };
}
export function newDraft(example = false): Draft {
  return { name: example ? "DNI + Foto" : "Nueva plantilla", description: "", paperSize: "A4", orientation: "PORTRAIT", width: 595.28, height: 841.89, marginTop: 28.35, marginRight: 28.35, marginBottom: 28.35, marginLeft: 28.35, pageCount: 1,
    elements: example ? [
      { ...newElement("IMAGE", 1), name: "DNI frontal", key: "dni_front", x: 56.7, y: 96, width: 226.8, height: 141.7 },
      { ...newElement("IMAGE", 2), name: "DNI trasero", key: "dni_back", x: 311.8, y: 96, width: 226.8, height: 141.7 },
      { ...newElement("IMAGE", 3), name: "Foto", key: "photo", x: 56.7, y: 278.4, width: 113.4, height: 141.7 },
    ] : [] };
}
export function toDraft(template: Template): Draft {
  const version = template.versions.find((item) => item.isActive) ?? template.versions[0]!;
  return toVersionDraft(template, version);
}

export function toVersionDraft(template: Template, version: Version): Draft {
  return { name: template.name, description: template.description ?? "", paperSize: version.paperSize, orientation: version.orientation,
    width: Number(version.width), height: Number(version.height), marginTop: Number(version.marginTop), marginRight: Number(version.marginRight), marginBottom: Number(version.marginBottom), marginLeft: Number(version.marginLeft), pageCount: version.pageCount ?? 1, expectedVersion: version.versionNumber,
    elements: version.elements.map((item) => ({ id: item.id, type: item.type, fileFieldId: item.fileFieldId ?? null, name: item.name, key: item.key, page: item.page, x: Number(item.x), y: Number(item.y), width: Number(item.width), height: Number(item.height), rotation: Number(item.rotation), zIndex: item.zIndex, required: item.required, properties: { ...properties, ...item.properties } })) };
}

export function editorToDocument(value: number, zoom: number) { return value / zoom; }
export function documentToEditor(value: number, zoom: number) { return value * zoom; }
export function documentToPdf(value: number) { return value; }
export function pdfToDocument(value: number) { return value; }

export function normalizeElement(element: StudioElement, draft: Pick<Draft, "width" | "height" | "pageCount">): StudioElement {
  const width = finiteInRange(element.width, 1, draft.width);
  const height = finiteInRange(element.height, 1, draft.height);
  return {
    ...element,
    page: Math.round(finiteInRange(element.page, 1, draft.pageCount)),
    x: finiteInRange(element.x, 0, Math.max(0, draft.width - width)),
    y: finiteInRange(element.y, 0, Math.max(0, draft.height - height)),
    width,
    height,
    rotation: finiteInRange(element.rotation, -180, 180),
    zIndex: Math.round(finiteInRange(element.zIndex, 0, 1000)),
    key: element.type === "IMAGE" || element.type === "FILE" ? sanitizeKey(element.key ?? element.name) : null,
    fileFieldId: element.type === "IMAGE" || element.type === "FILE" ? element.fileFieldId ?? null : null,
    properties: normalizeProperties(element.properties),
  };
}

export function normalizeDraft(draft: Draft): Draft {
  const width = finiteInRange(draft.width, 100, 2000);
  const height = finiteInRange(draft.height, 100, 2000);
  const pageCount = Math.round(finiteInRange(draft.pageCount, 1, 20));
  const normalized = {
    width,
    height,
    pageCount,
  };
  return {
    ...draft,
    name: draft.name.trim() || "Nueva plantilla",
    description: draft.description.slice(0, 1000),
    width,
    height,
    marginTop: finiteInRange(draft.marginTop, 0, height - 1),
    marginRight: finiteInRange(draft.marginRight, 0, width - 1),
    marginBottom: finiteInRange(draft.marginBottom, 0, height - 1),
    marginLeft: finiteInRange(draft.marginLeft, 0, width - 1),
    pageCount,
    elements: draft.elements.map((element, index) => normalizeElement({ ...element, zIndex: element.zIndex ?? index }, normalized)),
  };
}

export function snapElement(element: StudioElement, draft: Draft, threshold = 5): StudioElement {
  const snap = (value: number, targets: number[]) => targets.reduce((current, target) => Math.abs(value - target) <= threshold ? target : current, value);
  const centerX = (draft.width - element.width) / 2;
  const centerY = (draft.height - element.height) / 2;
  return normalizeElement({
    ...element,
    x: snap(element.x, [0, centerX, draft.width - element.width]),
    y: snap(element.y, [0, centerY, draft.height - element.height]),
  }, draft);
}

export function validateDraftForSave(draft: Draft): string | null {
  if (!draft.name.trim()) return "Asigna un nombre a la plantilla.";
  if (!Number.isFinite(draft.width) || !Number.isFinite(draft.height) || draft.width <= 0 || draft.height <= 0) return "El tamaño del papel no es válido.";
  if (draft.marginLeft + draft.marginRight >= draft.width || draft.marginTop + draft.marginBottom >= draft.height) return "Los márgenes no caben en la página.";
  const keys = new Set<string>();
  for (const element of draft.elements) {
    if (!["IMAGE", "FILE", "TEXT", "RECTANGLE", "LINE"].includes(element.type)) return "Hay un tipo de elemento no permitido.";
    if (![element.x, element.y, element.width, element.height, element.rotation].every(Number.isFinite)) return `El elemento ${element.name} tiene valores invalidos.`;
    if (element.width <= 0 || element.height <= 0) return `El elemento ${element.name} necesita ancho y alto positivos.`;
    if (element.x < 0 || element.y < 0 || element.x + element.width > draft.width || element.y + element.height > draft.height) return `El elemento ${element.name} está fuera de la página.`;
    if (element.type === "IMAGE" || element.type === "FILE") {
      if (!element.key || !/^[a-z][a-z0-9_]{0,59}$/.test(element.key)) return `La clave de ${element.name} debe usar minusculas, numeros y guion bajo.`;
      if (keys.has(element.key)) return `La clave ${element.key} esta repetida.`;
      keys.add(element.key);
    }
  }
  return null;
}

function finiteInRange(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Number(value.toFixed(3))));
}

function sanitizeKey(value: string) {
  const key = value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60);
  return /^[a-z]/.test(key) ? key : `slot_${key || "imagen"}`.slice(0, 60);
}

function normalizeProperties(value: ElementProperties): ElementProperties {
  return {
    ...properties,
    ...value,
    borderWidth: finiteInRange(value.borderWidth, 0, 10),
    borderRadius: finiteInRange(value.borderRadius, 0, 100),
    fontSize: finiteInRange(value.fontSize, 6, 100),
    strokeWidth: finiteInRange(value.strokeWidth, 0, 10),
    fileRenderMode: value.fileRenderMode === "PLACE" ? "PLACE" : "ATTACH",
    acceptedMimeTypes: Array.isArray(value.acceptedMimeTypes) ? value.acceptedMimeTypes.filter((item) => item === "application/pdf") : properties.acceptedMimeTypes,
    maxFiles: Math.round(finiteInRange(value.maxFiles, 1, 20)),
    maxSizeBytes: finiteInRange(value.maxSizeBytes, 1, 3 * 1024 * 1024),
  };
}

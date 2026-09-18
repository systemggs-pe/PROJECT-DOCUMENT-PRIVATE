export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export interface JsonObject {
  [key: string]: JsonValue;
}

export type PaperSize = "A4" | "A5" | "LETTER" | "LEGAL" | "CUSTOM";
export type Orientation = "PORTRAIT" | "LANDSCAPE";
export type TemplateStatus = "DRAFT" | "ACTIVE" | "ARCHIVED";
export type ElementType =
  | "IMAGE"
  | "FILE"
  | "TEXT"
  | "RECTANGLE"
  | "LINE"
  | "QR_CODE"
  | "BARCODE"
  | "SIGNATURE"
  | "DATE"
  | "PAGE_NUMBER"
  | "LOGO";
export type ImageFitMode = "contain" | "cover" | "fill" | "stretch";
export type StoredFileType = "IMAGE" | "PDF" | "DOCUMENT";
export type GenerationStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
export type AuditAction = "CREATE" | "UPDATE" | "DELETE" | "DOWNLOAD" | "GENERATE" | "LOGIN";
export type AuditEntityType =
  | "USER"
  | "TEMPLATE"
  | "TEMPLATE_VERSION"
  | "TEMPLATE_ELEMENT"
  | "GENERATION"
  | "GENERATION_INPUT"
  | "STORED_FILE";

export interface DocumentDefinition {
  pageSize: PaperSize;
  orientation: Orientation;
  pages: PageDefinition[];
  assets: AssetDefinition[];
  metadata?: {
    title?: string;
    author?: string;
  };
}

export interface PageDefinition {
  pageNumber: number;
  width: number;
  height: number;
  elements: ElementDefinition[];
}

export interface BaseElementDefinition {
  id: string;
  page: number;
  type: ElementType;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;
  required: boolean;
}

export interface ImageElementDefinition extends BaseElementDefinition {
  type: "IMAGE";
  key: string;
  assetKey?: string;
  properties: {
    fitMode: ImageFitMode;
    border?: boolean;
    borderWidth?: number;
    borderRadius?: number;
    borderColor?: string;
  };
}

export interface TextElementDefinition extends BaseElementDefinition {
  type: "TEXT";
  properties: {
    text: string;
    fontSize: number;
    fontFamily?: string;
    fontWeight?: "400" | "500" | "600" | "700" | "normal" | "bold";
    textAlign?: "left" | "center" | "right" | "justify";
    color?: string;
  };
}

export interface RectangleElementDefinition extends BaseElementDefinition {
  type: "RECTANGLE";
  properties: {
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
    borderRadius?: number;
  };
}

export interface LineElementDefinition extends BaseElementDefinition {
  type: "LINE";
  properties: {
    stroke: string;
    strokeWidth?: number;
  };
}

export interface FileElementDefinition extends BaseElementDefinition {
  type: "FILE";
  key: string;
  properties: {
    fileRenderMode: "ATTACH" | "PLACE";
    acceptedMimeTypes?: string[];
    maxSizeBytes?: number;
  };
}

export type ElementDefinition =
  | ImageElementDefinition
  | FileElementDefinition
  | TextElementDefinition
  | RectangleElementDefinition
  | LineElementDefinition;

export interface AssetDefinition {
  key: string;
  contentType: string;
  data: Uint8Array;
  fileName?: string;
}

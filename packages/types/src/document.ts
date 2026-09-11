export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export interface JsonObject {
  [key: string]: JsonValue;
}

export type PaperSize = "A4" | "A5" | "LETTER" | "LEGAL" | "CUSTOM";
export type Orientation = "PORTRAIT" | "LANDSCAPE";
export type ElementType = "IMAGE" | "TEXT" | "RECTANGLE" | "LINE";
export type ImageFitMode = "contain" | "cover" | "stretch";

export interface DocumentDefinition {
  pageSize: PaperSize;
  orientation: Orientation;
  pages: PageDefinition[];
  assets: AssetDefinition[];
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
    border: boolean;
    borderWidth: number;
    borderRadius: number;
  };
}

export interface TextElementDefinition extends BaseElementDefinition {
  type: "TEXT";
  properties: {
    text: string;
    fontSize: number;
    fontFamily: string;
    color: string;
  };
}

export interface RectangleElementDefinition extends BaseElementDefinition {
  type: "RECTANGLE";
  properties: {
    fill?: string;
    stroke?: string;
    strokeWidth: number;
  };
}

export interface LineElementDefinition extends BaseElementDefinition {
  type: "LINE";
  properties: {
    stroke: string;
    strokeWidth: number;
  };
}

export type ElementDefinition =
  | ImageElementDefinition
  | TextElementDefinition
  | RectangleElementDefinition
  | LineElementDefinition;

export interface AssetDefinition {
  key: string;
  contentType: string;
  data: Uint8Array;
  fileName?: string;
}

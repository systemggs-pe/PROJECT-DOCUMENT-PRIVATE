import type { DocumentDefinition } from "@ggs/types";

export interface PdfRenderResult {
  content: Uint8Array;
  contentType: "application/pdf";
  fileName?: string;
}

export interface PdfEngine {
  generate(document: DocumentDefinition): Promise<PdfRenderResult>;
}

export interface PdfEngineOptions {
  defaultAuthor?: string;
}

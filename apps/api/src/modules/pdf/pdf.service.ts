import { Injectable } from "@nestjs/common";
import { PdfKitEngine, type PdfRenderInput } from "@ggs/pdf-engine";
import type { DocumentDefinition, ElementDefinition, Orientation, PaperSize } from "@ggs/types";

type DecimalLike = number | { toNumber(): number };

export type PdfTemplateVersionRecord = {
  paperSize: PaperSize;
  orientation: Orientation;
  width: DecimalLike;
  height: DecimalLike;
  pageCount: number;
  elements: Array<Omit<ElementDefinition, "x" | "y" | "width" | "height" | "rotation"> & {
    x: DecimalLike;
    y: DecimalLike;
    width: DecimalLike;
    height: DecimalLike;
    rotation: DecimalLike;
  }>;
};

@Injectable()
export class PdfService {
  private readonly engine = new PdfKitEngine();

  render(input: PdfRenderInput): Promise<Buffer> {
    return this.engine.render(input);
  }

  renderTemplateVersion(version: PdfTemplateVersionRecord, assets: PdfRenderInput["assets"]): Promise<Buffer> {
    const document: DocumentDefinition = {
      pageSize: version.paperSize,
      orientation: version.orientation,
      assets,
      pages: Array.from({ length: version.pageCount }, (_, index) => ({
        pageNumber: index + 1,
        width: toNumber(version.width),
        height: toNumber(version.height),
        elements: version.elements
          .filter((element) => element.page === index + 1)
          .map((element) => ({
            ...element,
            x: toNumber(element.x),
            y: toNumber(element.y),
            width: toNumber(element.width),
            height: toNumber(element.height),
            rotation: toNumber(element.rotation),
          })) as ElementDefinition[],
      })),
    };
    return this.render(document);
  }
}

function toNumber(value: DecimalLike): number {
  return typeof value === "number" ? value : value.toNumber();
}

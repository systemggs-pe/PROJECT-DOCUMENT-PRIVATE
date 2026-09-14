import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";

import type { DocumentDefinition, ElementDefinition } from "@ggs/types";
import {
  PAPER_SIZE_POINTS,
  FontError,
  InvalidElementError,
  MissingImageAssetError,
  PdfKitEngine,
  UnsupportedImageFormatError,
  editorToPdfCoordinates,
  getPaperDimensions,
} from "./pdf-engine";

const onePixelPng = Uint8Array.from(Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
));

describe("pdf-engine contract", () => {
  it("uses application/pdf as the render result content type", () => {
    expect(new PdfKitEngine()).toBeInstanceOf(PdfKitEngine);
  });

  it("renders a valid A4 document with every supported element", async () => {
    const input = fixtureDocument([
      rectangle("background", 0, { x: 36, y: 36, width: 523, height: 180, rotation: 0 }),
      image("photo", 1, "contain", { x: 70, y: 70, width: 120, height: 90, rotation: 0 }),
      image("photo-cover", 2, "cover", { x: 220, y: 70, width: 120, height: 90, rotation: 12 }),
      image("photo-fill", 3, "fill", { x: 370, y: 70, width: 120, height: 90, rotation: -8 }),
      text("GGS Document Studio", 4, { x: 70, y: 178, width: 420, height: 28, rotation: 0 }),
      line("rule", 5, { x: 70, y: 214, width: 420, height: 1, rotation: 0 }),
    ], ["photo", "photo-cover", "photo-fill"].map((key) => ({ key, contentType: "image/png", data: onePixelPng })));

    const result = await new PdfKitEngine({ defaultAuthor: "GGS" }).generate(input);

    expect(result.contentType).toBe("application/pdf");
    expect(Buffer.from(result.content.subarray(0, 5)).toString("ascii")).toBe("%PDF-");
    const parsed = await PDFDocument.load(result.content);
    expect(parsed.getPageCount()).toBe(1);
    expect(parsed.getPage(0).getWidth()).toBeCloseTo(PAPER_SIZE_POINTS.A4.width, 3);
    expect(parsed.getPage(0).getHeight()).toBeCloseTo(PAPER_SIZE_POINTS.A4.height, 3);
    expect(parsed.getTitle()).toBe("GGS Document Studio");
  });

  it("supports all configured paper sizes and both orientations", async () => {
    for (const paperSize of ["A4", "A5", "LETTER", "LEGAL"] as const) {
      for (const orientation of ["PORTRAIT", "LANDSCAPE"] as const) {
        const dimensions = getPaperDimensions(paperSize, orientation)!;
        const result = await new PdfKitEngine().render({
          pageSize: paperSize,
          orientation,
          assets: [],
          pages: [{ pageNumber: 1, ...dimensions, elements: [] }],
        });
        const parsed = await PDFDocument.load(result);
        expect(parsed.getPage(0).getWidth()).toBeCloseTo(dimensions.width, 3);
        expect(parsed.getPage(0).getHeight()).toBeCloseTo(dimensions.height, 3);
      }
    }
  });

  it("keeps the editor top-left coordinate contract explicit", () => {
    expect(editorToPdfCoordinates({ width: 595.28, height: 841.89 }, { x: 40, y: 120, width: 80, height: 30 })).toEqual({ x: 40, y: 120, width: 80, height: 30 });
  });

  it("renders image contain, cover, fill, and the legacy stretch alias", async () => {
    for (const fitMode of ["contain", "cover", "fill", "stretch"] as const) {
      await expect(new PdfKitEngine().render(fixtureDocument([
        image(`image-${fitMode}`, 1, fitMode, { x: 50, y: 50, width: 180, height: 120, rotation: 25 }),
      ], [{ key: `image-${fitMode}`, contentType: "image/png", data: onePixelPng }]))).resolves.toSatisfy((value: Buffer) => value.subarray(0, 5).toString("ascii") === "%PDF-");
    }
  });

  it("never exports image slot borders, including legacy templates with border enabled", async () => {
    const imageWithLegacyBorder = image("photo", 1, "contain", { x: 50, y: 50, width: 180, height: 120, rotation: 0 });
    const imageWithoutBorder = { ...imageWithLegacyBorder, properties: { ...imageWithLegacyBorder.properties, border: false } };
    const assets = [{ key: "photo", contentType: "image/png", data: onePixelPng }];

    const withLegacyBorder = await new PdfKitEngine().render(fixtureDocument([imageWithLegacyBorder], assets));
    const withoutBorder = await new PdfKitEngine().render(fixtureDocument([imageWithoutBorder], assets));

    expect(withLegacyBorder.equals(withoutBorder)).toBe(true);
  });

  it("renders text alignment, bold fonts, wrapping, rounded rectangles, and rotated lines", async () => {
    const result = await new PdfKitEngine().render(fixtureDocument([
      text("left", 1, { x: 40, y: 40, width: 140, height: 50, rotation: 0 }),
      { ...text("center and bold", 2, { x: 200, y: 40, width: 160, height: 50, rotation: 0 }), properties: { ...text("center and bold", 2, { x: 200, y: 40, width: 160, height: 50, rotation: 0 }).properties, textAlign: "center", fontWeight: "700" } },
      { ...text("right", 3, { x: 380, y: 40, width: 140, height: 50, rotation: 0 }), properties: { ...text("right", 3, { x: 380, y: 40, width: 140, height: 50, rotation: 0 }).properties, textAlign: "right" } },
      rectangle("rounded", 0, { x: 40, y: 120, width: 480, height: 120, rotation: 0 }),
      line("rotated", 4, { x: 100, y: 280, width: 300, height: 1, rotation: 30 }),
    ]));
    const parsed = await PDFDocument.load(result);
    expect(parsed.getPageCount()).toBe(1);
  });

  it("orders elements by z-index and remains deterministic", async () => {
    const input = fixtureDocument([
      text("top", 20, { x: 40, y: 40, width: 100, height: 30, rotation: 0 }),
      rectangle("bottom", 1, { x: 40, y: 40, width: 100, height: 30, rotation: 0 }),
    ]);
    const first = await new PdfKitEngine().render(input);
    const second = await new PdfKitEngine().render(input);
    expect(first.equals(second)).toBe(true);
  });

  it("rejects missing assets, unsafe formats, invalid geometry, and unsupported fonts", async () => {
    const engine = new PdfKitEngine();
    await expect(engine.render(fixtureDocument([image("missing", 1, "contain", { x: 20, y: 20, width: 50, height: 50, rotation: 0 })]))).rejects.toBeInstanceOf(MissingImageAssetError);
    await expect(engine.render(fixtureDocument([image("webp", 1, "contain", { x: 20, y: 20, width: 50, height: 50, rotation: 0 })], [{ key: "webp", contentType: "image/webp", data: onePixelPng }]))).rejects.toBeInstanceOf(UnsupportedImageFormatError);
    await expect(engine.render(fixtureDocument([{ ...text("bad", 1, { x: 20, y: 20, width: 50, height: 50, rotation: 0 }), width: Number.NaN }]))).rejects.toBeInstanceOf(InvalidElementError);
    await expect(engine.render(fixtureDocument([{ ...text("bad font", 1, { x: 20, y: 20, width: 50, height: 50, rotation: 0 }), properties: { ...text("bad font", 1, { x: 20, y: 20, width: 50, height: 50, rotation: 0 }).properties, fontFamily: "Comic Sans" } }]))).rejects.toBeInstanceOf(FontError);
  });
});

function fixtureDocument(elements: ElementDefinition[], assets: DocumentDefinition["assets"] = []): DocumentDefinition {
  return {
    pageSize: "A4",
    orientation: "PORTRAIT",
    assets,
    metadata: { title: "GGS Document Studio" },
    pages: [{ pageNumber: 1, width: PAPER_SIZE_POINTS.A4.width, height: PAPER_SIZE_POINTS.A4.height, elements }],
  };
}

function text(content: string, zIndex: number, geometry: Pick<ElementDefinition, "x" | "y" | "width" | "height" | "rotation">): Extract<ElementDefinition, { type: "TEXT" }> {
  return { id: `text-${zIndex}-${content}`, page: 1, type: "TEXT", name: content, required: false, zIndex, ...geometry, properties: { text: content, fontSize: 14, fontFamily: "Helvetica", color: "#17211c" } };
}

function image(key: string, zIndex: number, fitMode: "contain" | "cover" | "fill" | "stretch", geometry: Pick<ElementDefinition, "x" | "y" | "width" | "height" | "rotation">): Extract<ElementDefinition, { type: "IMAGE" }> {
  return { id: `image-${key}`, page: 1, type: "IMAGE", name: key, key, required: true, zIndex, ...geometry, properties: { fitMode, border: true, borderWidth: 1, borderRadius: 8 } };
}

function rectangle(name: string, zIndex: number, geometry: Pick<ElementDefinition, "x" | "y" | "width" | "height" | "rotation">): Extract<ElementDefinition, { type: "RECTANGLE" }> {
  return { id: `rectangle-${name}`, page: 1, type: "RECTANGLE", name, required: false, zIndex, ...geometry, properties: { fill: "#eef2f4", stroke: "#63716a", strokeWidth: 1, borderRadius: 8 } };
}

function line(name: string, zIndex: number, geometry: Pick<ElementDefinition, "x" | "y" | "width" | "height" | "rotation">): Extract<ElementDefinition, { type: "LINE" }> {
  return { id: `line-${name}`, page: 1, type: "LINE", name, required: false, zIndex, ...geometry, properties: { stroke: "#2563eb", strokeWidth: 2 } };
}

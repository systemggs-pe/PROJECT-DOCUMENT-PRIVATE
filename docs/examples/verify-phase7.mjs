import { mkdirSync, writeFileSync } from "node:fs";
import pdfLib from "../../packages/pdf-engine/node_modules/pdf-lib/cjs/index.js";
import { PAPER_SIZE_POINTS, PdfKitEngine } from "../../packages/pdf-engine/dist/index.js";

const { PDFDocument } = pdfLib;

const png = Uint8Array.from(Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
));
const engine = new PdfKitEngine({ defaultAuthor: "GGS phase 7 verification" });
const portrait = PAPER_SIZE_POINTS.A4;
const landscape = { width: portrait.height, height: portrait.width };
const assets = [{ key: "dni_front", contentType: "image/png", data: png }];
const elements = [
  { id: "background", page: 1, type: "RECTANGLE", name: "Marco", required: false, x: 30, y: 30, width: 535, height: 230, rotation: 0, zIndex: 0, properties: { fill: "#eef2f4", stroke: "#63716a", strokeWidth: 1, borderRadius: 8 } },
  { id: "dni-front", page: 1, type: "IMAGE", name: "DNI frontal", key: "dni_front", required: true, x: 70, y: 70, width: 170, height: 110, rotation: 0, zIndex: 1, properties: { fitMode: "contain", border: true, borderWidth: 1, borderRadius: 6 } },
  { id: "title", page: 1, type: "TEXT", name: "Texto", required: false, x: 270, y: 88, width: 230, height: 42, rotation: 0, zIndex: 2, properties: { text: "Documento de prueba", fontSize: 16, fontFamily: "Helvetica", fontWeight: "700", textAlign: "center", color: "#17211c" } },
  { id: "rule", page: 1, type: "LINE", name: "Separador", required: false, x: 270, y: 150, width: 230, height: 1, rotation: 0, zIndex: 3, properties: { stroke: "#2563eb", strokeWidth: 2 } },
];

const portraitPdf = await engine.render({ pageSize: "A4", orientation: "PORTRAIT", assets, metadata: { title: "Fase 7 fixture" }, pages: [{ pageNumber: 1, ...portrait, elements }] });
const parsedPortrait = await PDFDocument.load(portraitPdf);
if (parsedPortrait.getPageCount() !== 1 || Math.abs(parsedPortrait.getPage(0).getWidth() - portrait.width) > 0.001 || Math.abs(parsedPortrait.getPage(0).getHeight() - portrait.height) > 0.001) throw new Error("A4 portrait dimensions are incorrect");

const landscapePdf = await engine.render({ pageSize: "A4", orientation: "LANDSCAPE", assets: [], pages: [{ pageNumber: 1, ...landscape, elements: [] }] });
const parsedLandscape = await PDFDocument.load(landscapePdf);
if (Math.abs(parsedLandscape.getPage(0).getWidth() - landscape.width) > 0.001 || Math.abs(parsedLandscape.getPage(0).getHeight() - landscape.height) > 0.001) throw new Error("A4 landscape dimensions are incorrect");

mkdirSync("tmp/pdfs", { recursive: true });
writeFileSync("tmp/pdfs/phase7-fixture.pdf", portraitPdf);
console.log(`phase7 fixture verified: ${portraitPdf.length} bytes, ${parsedPortrait.getPageCount()} page, A4 portrait + landscape checks passed`);

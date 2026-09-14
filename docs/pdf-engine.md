# PDF Engine

The PDF engine is an application-independent renderer in `packages/pdf-engine`. It receives a resolved `DocumentDefinition` and returns a PDF `Buffer`; it does not know about HTTP, NestJS, Prisma, Supabase, Storage, users, or business rules.

## Contract

```ts
interface PdfEngine {
  render(input: PdfRenderInput): Promise<Buffer>;
}
```

`PdfKitEngine` is the current implementation. `generate()` remains as a compatibility wrapper returning `{ content, contentType }`. The API's `PdfService` is a thin adapter that exposes the engine to future application services without creating a renderer endpoint.

## Coordinates and paper

Template coordinates are points (`pt`) with origin at the top-left. PDFKit's public drawing API uses the same coordinate convention, so `editorToPdfCoordinates()` is the single documented conversion boundary and currently preserves `x`, `y`, `width`, and `height`. Rotations are applied around the element center inside a balanced `save()`/`restore()` scope.

Paper sizes are derived from exact definitions: A4 and A5 use millimeters converted with `72 / 25.4`, while LETTER and LEGAL use inches converted with `72`. Portrait and landscape swap width and height. Custom pages use the dimensions supplied by the document.

## Elements

The engine renders `IMAGE`, `TEXT`, `RECTANGLE`, and `LINE`, sorted explicitly by `zIndex` and then stable element id. Images accept already-resolved in-memory buffers and support `contain`, `cover`, `fill`, and the legacy `stretch` alias. JPEG and PNG are supported after MIME and magic-byte checks. WebP, SVG, remote URLs, filesystem paths, and arbitrary strings are rejected.

Text supports bounded content, Helvetica/Times/Courier families (with Inter, Arial, and sans-serif falling back to Helvetica), normal/bold weights, left/center/right/justify alignment, clipping, wrapping, color, and rotation. Rectangles support fill, stroke, width, radius, and rotation. Lines use the element's width and height as the endpoint vector, with stroke width and color.

## Validation and limits

The renderer rejects invalid numbers, non-positive geometry, unsupported elements/fonts/formats, invalid hex colors, missing required image assets, non-sequential pages, mismatched standard paper dimensions, oversized pages, more than 20 pages, more than 100 elements per page, more than 10 MB per asset, more than 30 MB of input assets, text over 2,000 characters, and output over 30 MB. Elements may be partially outside the page when their origin is valid; PDFKit clips images and text to their own boxes, and the page naturally clips other drawing operations.

Errors are typed (`MissingImageAssetError`, `InvalidElementError`, `UnsupportedImageFormatError`, `UnsupportedElementTypeError`, `FontError`, `UnsupportedPaperSizeError`, and `PdfRenderError`) so the API layer can map them to safe user messages without returning stacks or sensitive data.

PDF metadata is deterministic and contains only a safe title, optional caller-provided author, `GGS Document Studio` as creator, and the engine producer. Creation date is fixed to avoid introducing nondeterminism into identical renders.

## Storage boundary

The API or a future generation service reads an owned `StoredFile` through `StorageService`, validates ownership and MIME before resolving it, and passes the resulting `Buffer` in `assets`. The engine never fetches URLs, opens paths, calls a database, or receives Supabase credentials.

## Verification

Unit tests cover paper sizes, orientations, all supported elements, image fits, rotation, alignment, layering, determinism, missing assets, formats, geometry, and fonts. `docs/examples/verify-phase7.mjs` creates an in-memory fixture, validates it with `pdf-lib`, writes a temporary PDF under `tmp/pdfs`, and checks A4 portrait and landscape. The script is run with:

```powershell
pnpm verify:phase7
```

Dynamic values, correlatives, final generation workflows, history, downloads, bulk generation, queues, and jobs remain outside this phase.

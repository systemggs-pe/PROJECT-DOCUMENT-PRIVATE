import { describe, expect, it } from "vitest";

import {
  applyAspectAroundCenter,
  calculateRotatedDimensions,
  clampCrop,
  getExtensionFromMime,
  initialCrop,
  normalizeRotation,
  replaceFileExtension,
  resizeCrop,
  rotateLeft,
  rotateRight,
  zoomCropAroundCenter,
} from "./image-crop";

describe("image crop helpers", () => {
  it("keeps a free crop inside image bounds", () => {
    const crop = clampCrop({ x: -20, y: 180, width: 180, height: 80 }, { width: 200, height: 200 }, "free");
    expect(crop).toEqual({ x: 0, y: 120, width: 180, height: 80 });
  });

  it("keeps 1:1 crops square", () => {
    const crop = applyAspectAroundCenter({ x: 10, y: 20, width: 180, height: 80 }, { width: 240, height: 200 }, "1:1");
    expect(Math.round(crop.width)).toBe(Math.round(crop.height));
    expect(crop.x).toBeGreaterThanOrEqual(0);
    expect(crop.y).toBeGreaterThanOrEqual(0);
    expect(crop.x + crop.width).toBeLessThanOrEqual(240);
    expect(crop.y + crop.height).toBeLessThanOrEqual(200);
  });

  it("keeps 4:3 crops at the expected ratio", () => {
    const crop = initialCrop({ width: 1200, height: 800 }, "4:3");
    expect(crop.width / crop.height).toBeCloseTo(4 / 3, 5);
  });

  it("resizes with aspect ratio constraints", () => {
    const crop = resizeCrop({ x: 50, y: 50, width: 300, height: 300 }, { width: 500, height: 500 }, "right", 120, 0, "1:1");
    expect(crop.width).toBeCloseTo(crop.height, 5);
    expect(crop.x + crop.width).toBeLessThanOrEqual(500);
  });

  it("zooms a crop around its center without leaving bounds", () => {
    const crop = zoomCropAroundCenter({ x: 100, y: 100, width: 800, height: 600 }, { width: 1200, height: 900 }, "4:3", 3);
    expect(crop.width / crop.height).toBeCloseTo(4 / 3, 5);
    expect(crop.width).toBeLessThan(800);
    expect(crop.x).toBeGreaterThanOrEqual(0);
    expect(crop.y).toBeGreaterThanOrEqual(0);
    expect(crop.x + crop.width).toBeLessThanOrEqual(1200);
    expect(crop.y + crop.height).toBeLessThanOrEqual(900);
  });

  it("normalizes and steps rotations", () => {
    expect(normalizeRotation(-90)).toBe(270);
    expect(rotateLeft(0)).toBe(270);
    expect(rotateRight(270)).toBe(0);
  });

  it("swaps dimensions after a 90 degree rotation", () => {
    expect(calculateRotatedDimensions({ width: 1920, height: 1080 }, 90)).toEqual({ width: 1080, height: 1920 });
    expect(calculateRotatedDimensions({ width: 1920, height: 1080 }, 180)).toEqual({ width: 1920, height: 1080 });
  });

  it("keeps file extension aligned with mime type", () => {
    expect(getExtensionFromMime("image/png")).toBe("png");
    expect(getExtensionFromMime("image/webp")).toBe("webp");
    expect(replaceFileExtension("documento.png", "image/jpeg")).toBe("documento.jpg");
    expect(replaceFileExtension("foto", "image/webp")).toBe("foto.webp");
  });
});

import { describe, expect, it } from "vitest";

import { validateFile } from "./file-model";

describe("FileLibrary validation", () => {
  it("accepts common image files under 10 MB", () => {
    const file = new File(["image"], "dni-front.jpg", { type: "image/jpeg" });

    expect(validateFile(file)).toBe("");
  });

  it("rejects unsupported, oversized, or misleading files", () => {
    expect(validateFile(new File(["svg"], "icon.svg", { type: "image/svg+xml" }))).toContain("formato");
    expect(validateFile(new File([new Uint8Array(10 * 1024 * 1024 + 1)], "foto.png", { type: "image/png" }))).toContain("tamano");
    expect(validateFile(new File(["html"], "foto.txt", { type: "image/jpeg" }))).toContain("extension");
  });
});

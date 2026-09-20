import { describe, expect, it } from "vitest";

import { validateFile } from "./file-model";

describe("FileLibrary validation", () => {
  it("accepts common image files under 10 MB", () => {
    const file = new File(["image"], "dni-front.jpg", { type: "image/jpeg" });

    expect(validateFile(file)).toBe("");
  });

  it("accepts PDF, DOC, and DOCX files under 10 MB", () => {
    expect(validateFile(new File(["%PDF-1.7"], "contrato.pdf", { type: "application/pdf" }))).toBe("");
    expect(validateFile(new File(["doc"], "carta.doc", { type: "application/msword" }))).toBe("");
    expect(validateFile(new File(["docx"], "informe.docx", { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }))).toBe("");
  });

  it("rejects unsupported, oversized, or misleading files", () => {
    expect(validateFile(new File(["svg"], "icon.svg", { type: "image/svg+xml" }))).toContain("formato");
    expect(validateFile(new File([new Uint8Array(10 * 1024 * 1024 + 1)], "foto.png", { type: "image/png" }))).toContain("tamaño");
    expect(validateFile(new File(["html"], "foto.txt", { type: "image/jpeg" }))).toContain("extension");
  });
});

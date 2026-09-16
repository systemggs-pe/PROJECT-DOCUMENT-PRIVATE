import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import { DocumentConversionService } from "./document-conversion.service";

describe("DocumentConversionService", () => {
  it("rejects unsupported MIME types before invoking conversion", async () => {
    const service = new DocumentConversionService(config());

    await expect(service.convertToPdf({ data: Buffer.from("pdf"), originalName: "archivo.pdf", mimeType: "application/pdf" })).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects corrupt DOCX content before invoking conversion", async () => {
    const service = new DocumentConversionService(config());

    await expect(service.convertToPdf({ data: Buffer.from("not a zip"), originalName: "contrato.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" })).rejects.toBeInstanceOf(BadRequestException);
  });
});

function config() {
  return { get: () => undefined } as never;
}

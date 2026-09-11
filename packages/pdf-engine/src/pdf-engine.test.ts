import { describe, expect, it } from "vitest";

import type { PdfRenderResult } from "./pdf-engine";

describe("pdf-engine contract", () => {
  it("uses application/pdf as the render result content type", () => {
    const result: PdfRenderResult = {
      content: new Uint8Array(),
      contentType: "application/pdf",
    };

    expect(result.contentType).toBe("application/pdf");
  });
});

import { describe, expect, it } from "vitest";

import type { DocumentDefinition } from "./document";

describe("document types", () => {
  it("allows a serializable document definition shape", () => {
    const document: DocumentDefinition = {
      pageSize: "A4",
      orientation: "PORTRAIT",
      assets: [],
      pages: [
        {
          pageNumber: 1,
          width: 595.28,
          height: 841.89,
          elements: [],
        },
      ],
    };

    expect(document.pages[0]?.pageNumber).toBe(1);
  });
});

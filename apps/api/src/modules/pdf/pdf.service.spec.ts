import { describe, expect, it } from "vitest";

import { PdfService } from "./pdf.service";

describe("PdfService", () => {
  it("maps a TemplateVersion and its TemplateElements into a valid PDF", async () => {
    const pdf = await new PdfService().renderTemplateVersion({
      paperSize: "A4",
      orientation: "PORTRAIT",
      width: { toNumber: () => 595.275591 },
      height: { toNumber: () => 841.889764 },
      pageCount: 1,
      elements: [
        {
          id: "rectangle-1",
          page: 1,
          type: "RECTANGLE",
          name: "Marco",
          required: false,
          x: { toNumber: () => 40 },
          y: { toNumber: () => 40 },
          width: { toNumber: () => 200 },
          height: { toNumber: () => 100 },
          rotation: { toNumber: () => 0 },
          zIndex: 0,
          properties: { fill: "#eef2f4", stroke: "#63716a", strokeWidth: 1, borderRadius: 8 },
        },
        {
          id: "text-1",
          page: 1,
          type: "TEXT",
          name: "Texto",
          required: false,
          x: 56,
          y: 70,
          width: 168,
          height: 30,
          rotation: 0,
          zIndex: 1,
          properties: { text: "TemplateVersion", fontSize: 12, fontFamily: "Helvetica", color: "#17211c" },
        },
      ],
    }, []);

    expect(pdf.subarray(0, 5).toString("ascii")).toBe("%PDF-");
  });
});

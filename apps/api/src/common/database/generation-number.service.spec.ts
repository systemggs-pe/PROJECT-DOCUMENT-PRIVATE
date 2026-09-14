import { describe, expect, it } from "vitest";

import { formatGenerationNumber } from "./generation-number.service";

describe("formatGenerationNumber", () => {
  it("formats the default GGS sequence number", () => {
    expect(formatGenerationNumber("GGS", 1, 6)).toBe("GGS-000001");
    expect(formatGenerationNumber("GGS", 42, 6)).toBe("GGS-000042");
  });

  it("supports future prefixes and padding rules", () => {
    expect(formatGenerationNumber("EXP-2026", 7, 6)).toBe("EXP-2026-000007");
    expect(formatGenerationNumber("DOC", 1200, 4)).toBe("DOC-1200");
  });
});

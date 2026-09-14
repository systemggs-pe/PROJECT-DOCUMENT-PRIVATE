import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import { parseGenerationQuery } from "./generation-query";

describe("generation-query", () => {
  it("normalizes safe filters and defaults page size", () => {
    expect(parseGenerationQuery({ search: "GGS-0001", status: "COMPLETED", page: "2" })).toMatchObject({ search: "GGS-0001", status: "COMPLETED", page: 2, pageSize: 20, sort: "createdAt", order: "desc" });
  });

  it("rejects invalid state, sorting and date ranges", () => {
    expect(() => parseGenerationQuery({ status: "DONE" })).toThrow(BadRequestException);
    expect(() => parseGenerationQuery({ sort: "sql", order: "desc" })).toThrow(BadRequestException);
    expect(() => parseGenerationQuery({ from: "2026-09-20", to: "2026-09-01" })).toThrow(BadRequestException);
    expect(() => parseGenerationQuery({ pageSize: 101 })).toThrow(BadRequestException);
  });
});

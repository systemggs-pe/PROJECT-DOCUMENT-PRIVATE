import { describe, expect, it } from "vitest";

import { healthStatusSchema } from "./health";

describe("healthStatusSchema", () => {
  it("validates the API health payload", () => {
    expect(
      healthStatusSchema.parse({
        status: "ok",
        service: "ggs-document-studio-api",
        database: "connected",
      }),
    ).toEqual({
      status: "ok",
      service: "ggs-document-studio-api",
      database: "connected",
    });
  });
});

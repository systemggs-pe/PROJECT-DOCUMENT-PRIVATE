import { describe, expect, it } from "vitest";

import { AppController } from "./app.controller";

describe("AppController", () => {
  it("returns the health status", () => {
    expect(new AppController().health()).toEqual({
      status: "ok",
      service: "ggs-document-studio-api",
    });
  });
});

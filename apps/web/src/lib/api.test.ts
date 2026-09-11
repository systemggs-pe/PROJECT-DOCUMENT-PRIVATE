import { describe, expect, it } from "vitest";

import { getApiBaseUrl } from "./api";

describe("getApiBaseUrl", () => {
  it("returns a configured or default API URL", () => {
    expect(getApiBaseUrl()).toMatch(/^http/);
  });
});

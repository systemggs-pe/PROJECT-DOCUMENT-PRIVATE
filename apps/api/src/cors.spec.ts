import { describe, expect, it } from "vitest";

import { getCorsOrigins, isCorsOriginAllowed, parseCorsOrigins } from "./cors";

describe("CORS policy", () => {
  it("requires explicit production origins", () => {
    expect(isCorsOriginAllowed("https://web-ggs-e214.vercel.app", getCorsOrigins(undefined, "production"), "production")).toBe(false);
  });

  it("allows configured exact origins and trims trailing slashes", () => {
    const origins = getCorsOrigins("https://studio.example.com/, https://admin.example.com");

    expect(isCorsOriginAllowed("https://studio.example.com", origins, "production")).toBe(true);
    expect(isCorsOriginAllowed("https://admin.example.com", origins, "production")).toBe(true);
  });

  it("supports wildcard subdomains without allowing the parent domain", () => {
    const origins = parseCorsOrigins("https://*.vercel.app");

    expect(isCorsOriginAllowed("https://preview-123.vercel.app", origins, "production")).toBe(true);
    expect(isCorsOriginAllowed("https://vercel.app", origins, "production")).toBe(false);
  });

  it("allows dynamic local Vite ports only outside production", () => {
    const origins = getCorsOrigins(undefined);

    expect(isCorsOriginAllowed("http://127.0.0.1:5174", origins, "development")).toBe(true);
    expect(isCorsOriginAllowed("http://127.0.0.1:5174", origins, "production")).toBe(false);
  });

  it("rejects unknown production origins without raising a server error", () => {
    expect(isCorsOriginAllowed("https://unknown.example.com", getCorsOrigins(undefined), "production")).toBe(false);
  });
});

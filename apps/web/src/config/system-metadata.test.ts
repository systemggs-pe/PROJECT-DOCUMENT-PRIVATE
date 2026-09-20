import { describe, expect, it } from "vitest";

import { appVersion, getDiagnosticInfo, sanitizeExternalUrl, systemMetadata } from "./system-metadata";

describe("systemMetadata", () => {
  it("uses a semantic application version from the build metadata", () => {
    expect(appVersion).toMatch(/^\d+\.\d+\.\d+/);
    expect(systemMetadata.version).toBe(appVersion);
  });

  it("keeps provider metadata separate from customer company settings", () => {
    expect(systemMetadata.productName).toBe("GGS Document Studio");
    expect(systemMetadata.poweredBy).toContain("GGS Code");
    expect(systemMetadata).not.toHaveProperty("companyName");
  });

  it("accepts only safe external URLs", () => {
    expect(sanitizeExternalUrl("https://example.com/docs")).toBe("https://example.com/docs");
    expect(sanitizeExternalUrl("javascript:alert(1)")).toBeUndefined();
    expect(sanitizeExternalUrl("file:///C:/secret")).toBeUndefined();
  });

  it("builds diagnostic information without secrets or document data", () => {
    const diagnostic = getDiagnosticInfo("Test Browser");

    expect(diagnostic).toContain("Producto: GGS Document Studio");
    expect(diagnostic).toContain(`Versión: ${systemMetadata.version}`);
    expect(diagnostic).toContain("Navegador: Test Browser");
    expect(diagnostic).not.toMatch(/DATABASE_URL|SUPABASE|TOKEN|SECRET|PASSWORD/i);
  });
});

import type * as BootstrapModule from "./bootstrap";
import type * as ServerlessModule from "./serverless";
import type { INestApplication } from "@nestjs/common";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createApplication } from "./bootstrap";
import { SupabaseAuthGuard } from "./modules/auth/guards/supabase-auth.guard";
import { PermissionsGuard } from "./modules/auth/guards/permissions.guard";
import { FilesService } from "./modules/files/files.service";
import { GenerationRunnerService } from "./modules/generations/generation-runner.service";
import { GenerationsService } from "./modules/generations/generations.service";
import { parsePoolMax } from "./common/database/prisma.service";

const state = vi.hoisted(() => ({ app: undefined as INestApplication | undefined }));
vi.mock("./bootstrap", async (importOriginal) => {
  const original = await importOriginal<typeof BootstrapModule>();
  return { createApplication: vi.fn(async (production?: boolean) => {
    state.app = await original.createApplication(production);
    return state.app;
  }) };
});

let adapter: typeof ServerlessModule;
beforeAll(async () => {
  vi.stubEnv("DATABASE_URL", "");
  vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-placeholder-not-a-secret");
  vi.stubEnv("SUPABASE_JWT_SECRET", "test-only");
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("CORS_ORIGIN", "https://frontend.example.com");
  adapter = await import("./serverless.js");
});
afterEach(() => vi.restoreAllMocks());
afterAll(async () => { await state.app?.close(); vi.unstubAllEnvs(); });

function invoke(path: string, overrides: Record<string, unknown> = {}) {
  return adapter.handler({ path, httpMethod: "GET", headers: {}, queryStringParameters: null, body: null, isBase64Encoded: false, ...overrides }, {});
}

describe("Netlify adapter with real Nest routes", () => {
  it("retries failed cold starts then shares initialization across concurrent calls", async () => {
    vi.mocked(createApplication).mockRejectedValueOnce(new Error("cold start failed"));
    await expect(invoke("/health")).rejects.toThrow("cold start failed");
    const results = await Promise.all([invoke("/api/health"), invoke("/.netlify/functions/api/health"), invoke("/health")]);
    for (const result of results) {
      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body)).toMatchObject({ status: "ok", database: "not_configured" });
    }
    expect(createApplication).toHaveBeenCalledTimes(2);
  });

  it("does not strip prefixes from unrelated routes", () => {
    expect(adapter.normalizeFunctionPath("/apiary")).toBe("/apiary");
    expect(adapter.normalizeFunctionPath("/api")).toBe("/");
  });

  it("keeps protected routes and invalid JWTs unauthorized", async () => {
    for (const path of ["/auth/me", "/files", "/generations", "/templates", "/users"]) {
      expect((await invoke(`/api${path}`)).statusCode).toBe(401);
    }
    expect((await invoke("/api/auth/me", { headers: { authorization: "Bearer invalid" } })).statusCode).toBe(401);
  });

  it("returns CORS headers only for the configured frontend, including preflight", async () => {
    const allowed = await invoke("/api/health", { headers: { origin: "https://frontend.example.com" } });
    expect(allowed.headers["access-control-allow-origin"]).toBe("https://frontend.example.com");
    const denied = await invoke("/api/health", { headers: { origin: "https://unknown.example.com" } });
    expect(denied.headers["access-control-allow-origin"]).toBeUndefined();
    const preflight = await invoke("/api/files", { httpMethod: "OPTIONS", headers: { origin: "https://frontend.example.com", "access-control-request-method": "POST", "access-control-request-headers": "authorization,content-type" } });
    expect(preflight.statusCode).toBe(204);
    expect(preflight.headers["access-control-allow-origin"]).toBe("https://frontend.example.com");
  });

  it("decodes base64 multipart images/PDFs and rejects files over 3 MiB", async () => {
    vi.spyOn(SupabaseAuthGuard.prototype, "canActivate").mockImplementation(async (context) => {
      context.switchToHttp().getRequest().user = { id: "test-user" };
      return true;
    });
    vi.spyOn(PermissionsGuard.prototype, "canActivate").mockReturnValue(true);
    const upload = vi.spyOn(FilesService.prototype, "upload").mockResolvedValue({ id: "test" } as never);
    for (const [name, mime, size, expected] of [["photo.png", "image/png", 3 * 1024 * 1024, 201], ["file.pdf", "application/pdf", 100, 201], ["large.pdf", "application/pdf", 3 * 1024 * 1024 + 1, 413]] as const) {
      const body = Buffer.concat([Buffer.from(`--boundary\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: ${mime}\r\n\r\n`), Buffer.alloc(size, 65), Buffer.from("\r\n--boundary--\r\n")]);
      const result = await invoke("/api/files", { httpMethod: "POST", headers: { "content-type": "multipart/form-data; boundary=boundary" }, body: body.toString("base64"), isBase64Encoded: true });
      expect(result.statusCode).toBe(expected);
    }
    expect(upload).toHaveBeenCalledTimes(2);
    expect(upload.mock.calls[0]?.[1]?.buffer.length).toBe(3 * 1024 * 1024);
  });

  it("encodes preview PDFs as binary and returns a controlled error for oversized previews", async () => {
    vi.spyOn(SupabaseAuthGuard.prototype, "canActivate").mockImplementation(async (context) => {
      context.switchToHttp().getRequest().user = { id: "test-user" };
      return true;
    });
    vi.spyOn(PermissionsGuard.prototype, "canActivate").mockReturnValue(true);
    const pdf = Buffer.from("%PDF-1.7\n\u0000\u00ff");
    const preview = vi.spyOn(GenerationRunnerService.prototype, "preview").mockResolvedValue(pdf);
    const result = await invoke("/api/generations/preview", { httpMethod: "POST" });
    expect(result.isBase64Encoded).toBe(true);
    expect(Buffer.from(result.body, "base64")).toEqual(pdf);
    preview.mockResolvedValueOnce(Buffer.alloc(4_600_000));
    expect((await invoke("/api/generations/preview", { httpMethod: "POST" })).statusCode).toBe(413);
  });

  it("redirects authorized downloads to signed storage URLs without buffering the files", async () => {
    vi.spyOn(SupabaseAuthGuard.prototype, "canActivate").mockImplementation(async (context) => {
      context.switchToHttp().getRequest().user = { id: "test-user" };
      return true;
    });
    vi.spyOn(PermissionsGuard.prototype, "canActivate").mockReturnValue(true);
    const signFile = vi.spyOn(FilesService.prototype, "signedUrl").mockResolvedValue({ url: "https://example.supabase.co/signed-file", expiresIn: 300 });
    const signGeneration = vi.spyOn(GenerationsService.prototype, "signedUrlOwned").mockResolvedValue({ url: "https://example.supabase.co/signed-generation", expiresIn: 300 });
    const id = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
    for (const resource of ["files", "generations"]) {
      const result = await invoke(`/api/${resource}/${id}/download`);
      expect(result.statusCode).toBe(302);
      expect(result.headers.location).toContain("https://example.supabase.co/signed-");
      expect(result.headers["cache-control"]).toBe("private, no-store");
    }
    expect(signFile).toHaveBeenCalledWith(id, { id: "test-user" });
    expect(signGeneration).toHaveBeenCalledWith(id, { id: "test-user" });
  });
});

describe("serverless connection budget", () => {
  it("defaults to two connections and validates explicit limits", () => {
    expect(parsePoolMax(undefined)).toBe(2);
    expect(parsePoolMax("1")).toBe(1);
    for (const invalid of ["0", "11", "1.5", "invalid", ""]) expect(() => parsePoolMax(invalid)).toThrow("DATABASE_POOL_MAX");
  });
});

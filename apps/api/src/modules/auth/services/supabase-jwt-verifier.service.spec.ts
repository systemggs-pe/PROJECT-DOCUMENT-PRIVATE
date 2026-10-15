import { ConfigService } from "@nestjs/config";
import { UnauthorizedException } from "@nestjs/common";
import type * as Jose from "jose" with { "resolution-mode": "import" };
import { createServer } from "node:http";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { beforeAll, describe, expect, it } from "vitest";

import { SupabaseJwtVerifierService } from "./supabase-jwt-verifier.service";

const secret = "test-secret-with-enough-length";
const issuer = "https://project.supabase.co/auth/v1";
let jose: typeof Jose;
beforeAll(async () => { jose = await import("jose"); });

describe("SupabaseJwtVerifierService", () => {
  it("verifies a signed Supabase access token and extracts safe identity fields", async () => {
    const verifier = createVerifier();
    const token = await signToken({
      sub: "4eb77b04-1389-48df-8d3c-e7de38e63f7c",
      email: "USER@Example.COM",
      user_metadata: {
        name: "  Ada Lovelace  ",
        avatar_url: "https://example.com/avatar.png",
        isActive: false,
        authProviderId: "not-trusted",
      },
    });

    await expect(verifier.verify(token)).resolves.toEqual({
      authProviderId: "4eb77b04-1389-48df-8d3c-e7de38e63f7c",
      email: "user@example.com",
      name: "Ada Lovelace",
      avatarUrl: "https://example.com/avatar.png",
    });
  });

  it("rejects missing, invalid, expired, or malformed tokens", async () => {
    const verifier = createVerifier();
    const expiredToken = await signToken(
      {
        sub: "4eb77b04-1389-48df-8d3c-e7de38e63f7c",
        email: "user@example.com",
      },
      -60,
    );
    const missingEmailToken = await signToken({
      sub: "4eb77b04-1389-48df-8d3c-e7de38e63f7c",
    });

    await expect(verifier.verify("not-a-jwt")).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(verifier.verify(expiredToken)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(verifier.verify(missingEmailToken)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("rejects an invalid signature, issuer, audience and subject", async () => {
    const verifier = createVerifier();
    const payload = { sub: "4eb77b04-1389-48df-8d3c-e7de38e63f7c", email: "user@example.com" };
    for (const overrides of [
      { secret: "different-test-secret-with-enough-length" },
      { issuer: "https://other.supabase.co/auth/v1" },
      { audience: "other-audience" },
    ]) {
      await expect(verifier.verify(await signToken(payload, 3600, overrides))).rejects.toBeInstanceOf(UnauthorizedException);
    }
    await expect(verifier.verify(await signToken({ ...payload, sub: "invalid" }))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("verifies asymmetric JWTs and reuses the remote JWKS cache across concurrent requests", async () => {
    const { publicKey, privateKey } = await jose.generateKeyPair("RS256");
    const jwk = { ...await jose.exportJWK(publicKey), kid: "test-key", alg: "RS256", use: "sig" };
    let requests = 0;
    const server = createServer((_request, response) => {
      requests += 1;
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ keys: [jwk] }));
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    try {
      const address = server.address() as AddressInfo;
      const verifier = new SupabaseJwtVerifierService(new ConfigService({
        SUPABASE_URL: "https://project.supabase.co",
        SUPABASE_JWKS_URL: `http://127.0.0.1:${address.port}/jwks`,
        SUPABASE_JWT_SECRET: "",
        SUPABASE_JWT_AUDIENCE: "authenticated",
      }));
      const token = await new jose.SignJWT({ email: "user@example.com" })
        .setProtectedHeader({ alg: "RS256", kid: "test-key" }).setSubject("4eb77b04-1389-48df-8d3c-e7de38e63f7c")
        .setIssuer(issuer).setAudience("authenticated").setExpirationTime("5m").sign(privateKey);
      const results = await Promise.all(Array.from({ length: 8 }, () => verifier.verify(token)));
      for (const result of results) expect(result.email).toBe("user@example.com");
      await expect(verifier.verify(token)).resolves.toMatchObject({ email: "user@example.com" });
      expect(requests).toBe(1);
      const expired = await new jose.SignJWT({ email: "user@example.com" })
        .setProtectedHeader({ alg: "RS256", kid: "test-key" }).setSubject("4eb77b04-1389-48df-8d3c-e7de38e63f7c")
        .setIssuer(issuer).setAudience("authenticated").setExpirationTime(1).sign(privateKey);
      await expect(verifier.verify(expired)).rejects.toBeInstanceOf(UnauthorizedException);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });
});

function createVerifier(): SupabaseJwtVerifierService {
  const configService = new ConfigService({
    SUPABASE_URL: "https://project.supabase.co",
    SUPABASE_JWT_SECRET: secret,
    SUPABASE_JWT_AUDIENCE: "authenticated",
  });

  return new SupabaseJwtVerifierService(configService);
}

async function signToken(payload: Record<string, unknown>, expiresInSeconds = 3600, overrides: { secret?: string; issuer?: string; audience?: string } = {}): Promise<string> {
  return new jose.SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(overrides.issuer ?? issuer)
    .setAudience(overrides.audience ?? "authenticated")
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + expiresInSeconds)
    .sign(new TextEncoder().encode(overrides.secret ?? secret));
}

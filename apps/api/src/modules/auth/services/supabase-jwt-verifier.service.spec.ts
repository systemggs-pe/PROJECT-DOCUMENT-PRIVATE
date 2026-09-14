import { ConfigService } from "@nestjs/config";
import { UnauthorizedException } from "@nestjs/common";
import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";

import { SupabaseJwtVerifierService } from "./supabase-jwt-verifier.service";

const secret = "test-secret-with-enough-length";
const issuer = "https://project.supabase.co/auth/v1";

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
});

function createVerifier(): SupabaseJwtVerifierService {
  const configService = new ConfigService({
    SUPABASE_URL: "https://project.supabase.co",
    SUPABASE_JWT_SECRET: secret,
    SUPABASE_JWT_AUDIENCE: "authenticated",
  });

  return new SupabaseJwtVerifierService(configService);
}

async function signToken(payload: Record<string, unknown>, expiresInSeconds = 3600): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(issuer)
    .setAudience("authenticated")
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + expiresInSeconds)
    .sign(new TextEncoder().encode(secret));
}

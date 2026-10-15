import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type * as Jose from "jose" with { "resolution-mode": "import" };

import type { SupabaseIdentity } from "../types/current-user";
import type { SupabaseJwtClaims } from "../types/supabase-jwt-claims";

const DEFAULT_AUDIENCE = "authenticated";
let joseModule: Promise<typeof Jose> | undefined;

function loadJose(): Promise<typeof Jose> {
  // Node16 emit keeps this as native import() even though this package is CommonJS.
  return joseModule ??= import("jose").catch((error: unknown) => {
    joseModule = undefined;
    throw error;
  });
}

@Injectable()
export class SupabaseJwtVerifierService {
  private readonly issuer: string | undefined;
  private readonly audience: string;
  private readonly jwtSecret: Uint8Array | undefined;
  private readonly jwksUrl: string | undefined;
  private jwks: ReturnType<typeof Jose.createRemoteJWKSet> | undefined;

  constructor(@Inject(ConfigService) private readonly configService: ConfigService) {
    const supabaseUrl = normalizeSupabaseUrl(this.configService.get<string>("SUPABASE_URL"));
    const jwksUrl = normalizeUrl(this.configService.get<string>("SUPABASE_JWKS_URL"));
    const jwtSecret = this.configService.get<string>("SUPABASE_JWT_SECRET");

    this.issuer = supabaseUrl ? `${supabaseUrl}/auth/v1` : undefined;
    this.audience = this.configService.get<string>("SUPABASE_JWT_AUDIENCE") ?? DEFAULT_AUDIENCE;
    this.jwtSecret = jwtSecret ? new TextEncoder().encode(jwtSecret) : undefined;
    this.jwksUrl = jwksUrl ?? (supabaseUrl ? `${supabaseUrl}/auth/v1/.well-known/jwks.json` : undefined);
  }

  async verify(accessToken: string): Promise<SupabaseIdentity> {
    const claims = await this.verifyClaims(accessToken);

    if (!claims.sub || !isUuid(claims.sub)) {
      throw new UnauthorizedException("Invalid authentication token");
    }

    if (!claims.email || !isSafeEmail(claims.email)) {
      throw new UnauthorizedException("Authenticated user email is required");
    }

    return {
      authProviderId: claims.sub,
      email: claims.email.trim().toLowerCase(),
      name: normalizeOptionalString(readMetadataString(claims.user_metadata, "name")),
      avatarUrl: normalizeOptionalString(readMetadataString(claims.user_metadata, "avatar_url")),
    };
  }

  private async verifyClaims(accessToken: string): Promise<SupabaseJwtClaims> {
    const options: Jose.JWTVerifyOptions = this.issuer
      ? { audience: this.audience, issuer: this.issuer }
      : { audience: this.audience };

    try {
      const { createRemoteJWKSet, jwtVerify } = await loadJose();
      if (this.jwtSecret) {
        const { payload } = await jwtVerify(accessToken, this.jwtSecret, options);
        return payload as SupabaseJwtClaims;
      }

      if (this.jwksUrl) {
        // One resolver per service instance, shared by concurrent invocations.
        this.jwks ??= createRemoteJWKSet(new URL(this.jwksUrl));
        const { payload } = await jwtVerify(accessToken, this.jwks, options);
        return payload as SupabaseJwtClaims;
      }
    } catch {
      throw new UnauthorizedException("Invalid authentication token");
    }

    throw new UnauthorizedException("Authentication provider is not configured");
  }
}

function normalizeSupabaseUrl(value: string | undefined): string | undefined {
  const url = normalizeUrl(value);
  if (!url || url.includes("your-project.supabase.co")) {
    return undefined;
  }

  return url.replace(/\/$/, "");
}

function normalizeUrl(value: string | undefined): string | undefined {
  if (!value || value.trim() === "") {
    return undefined;
  }

  try {
    return new URL(value.trim()).toString().replace(/\/$/, "");
  } catch {
    return undefined;
  }
}

function readMetadataString(metadata: Record<string, unknown> | undefined, key: string): string | null {
  const value = metadata?.[key];
  return typeof value === "string" ? value : null;
}

function normalizeOptionalString(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= 500 ? normalized : null;
}

function isSafeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

import type { JWTPayload } from "jose";

export interface SupabaseJwtClaims extends JWTPayload {
  sub: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
}

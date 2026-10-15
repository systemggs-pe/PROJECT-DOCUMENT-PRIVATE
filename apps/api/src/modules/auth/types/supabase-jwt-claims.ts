import type { JWTPayload } from "jose" with { "resolution-mode": "import" };

export interface SupabaseJwtClaims extends JWTPayload {
  sub: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
}

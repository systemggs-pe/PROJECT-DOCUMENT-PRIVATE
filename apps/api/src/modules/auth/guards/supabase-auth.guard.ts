import type { CanActivate, ExecutionContext } from "@nestjs/common";
import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";

import { IS_PUBLIC_KEY } from "../decorators/public.decorator";
import { SupabaseJwtVerifierService } from "../services/supabase-jwt-verifier.service";
import { UserSyncService } from "../services/user-sync.service";
import type { AuthenticatedRequest } from "../types/current-user";

@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(SupabaseJwtVerifierService) private readonly jwtVerifier: SupabaseJwtVerifierService,
    @Inject(UserSyncService) private readonly userSync: UserSyncService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request & AuthenticatedRequest>();
    const token = extractBearerToken(request);
    const identity = await this.jwtVerifier.verify(token);
    request.user = await this.userSync.sync(identity);

    return true;
  }
}

function extractBearerToken(request: Request): string {
  const header = request.headers.authorization;

  if (!header) {
    throw new UnauthorizedException("Missing bearer token");
  }

  const [scheme, token, extra] = header.split(" ");
  if (scheme !== "Bearer" || !token || extra) {
    throw new UnauthorizedException("Invalid authorization header");
  }

  return token;
}

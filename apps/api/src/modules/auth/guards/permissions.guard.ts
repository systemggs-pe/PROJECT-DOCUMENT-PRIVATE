import type { CanActivate, ExecutionContext } from "@nestjs/common";
import { ForbiddenException, Inject, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import { IS_PUBLIC_KEY } from "../decorators/public.decorator";
import { PERMISSIONS_KEY } from "../decorators/permissions.decorator";
import { ROLES_KEY } from "../decorators/roles.decorator";
import { AuthorizationService } from "../services/authorization.service";
import type { AuthenticatedRequest } from "../types/current-user";
import type { PermissionKey, SystemRoleKey } from "../authorization.constants";

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(AuthorizationService) private readonly authorization: AuthorizationService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()]);
    if (isPublic) return true;

    const requiredPermissions = this.reflector.getAllAndOverride<PermissionKey[]>(PERMISSIONS_KEY, [context.getHandler(), context.getClass()]) ?? [];
    const requiredRoles = this.reflector.getAllAndOverride<SystemRoleKey[]>(ROLES_KEY, [context.getHandler(), context.getClass()]) ?? [];
    if (requiredPermissions.length === 0 && requiredRoles.length === 0) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;
    if (!user) throw new ForbiddenException("No tienes permisos para realizar esta accion.");
    if (!user.isActive) throw new ForbiddenException("Tu cuenta esta desactivada.");

    if (!this.authorization.hasAnyRole(user.authorization, requiredRoles)) throw new ForbiddenException("No tienes permisos para realizar esta accion.");
    if (!this.authorization.hasAllPermissions(user.authorization, requiredPermissions)) throw new ForbiddenException("No tienes permisos para realizar esta accion.");

    return true;
  }
}

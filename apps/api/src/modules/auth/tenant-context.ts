import { ForbiddenException } from "@nestjs/common";

import { SYSTEM_ROLES } from "./authorization.constants";
import type { CurrentUser } from "./types/current-user";

export function isSuperAdmin(user: CurrentUser): boolean {
  return user.authorization.roles.some((role) => role.key === SYSTEM_ROLES.SUPERADMIN);
}

export function requireTenant(user: CurrentUser): string {
  if (!user.organizationId) throw new ForbiddenException("Tu usuario no pertenece a una organizacion activa.");
  if (user.organization?.status !== "ACTIVE") throw new ForbiddenException("La organizacion no esta activa.");
  return user.organizationId;
}

export function isAdmin(user: CurrentUser): boolean {
  return user.authorization.roles.some((role) => role.key === SYSTEM_ROLES.ADMIN);
}

export function resourceScope(user: CurrentUser) {
  if (isSuperAdmin(user)) return {};
  const organizationId = requireTenant(user);
  return isAdmin(user) ? { organizationId } : { organizationId, createdById: user.id };
}

export function tenantScope(user: CurrentUser) {
  if (isSuperAdmin(user)) return {};
  return { organizationId: requireTenant(user) };
}

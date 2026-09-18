import { SYSTEM_ROLES } from "./authorization.constants";
import type { CurrentUser } from "./types/current-user";

export function isSuperAdmin(user: CurrentUser): boolean {
  return user.authorization.roles.some((role) => role.key === SYSTEM_ROLES.SUPERADMIN);
}

export function isAdmin(user: CurrentUser): boolean {
  return user.authorization.roles.some((role) => role.key === SYSTEM_ROLES.ADMIN);
}

export function resourceScope(user: CurrentUser) {
  return isSuperAdmin(user) || isAdmin(user) ? {} : { createdById: user.id };
}

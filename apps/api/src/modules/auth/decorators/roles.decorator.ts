import { SetMetadata } from "@nestjs/common";

import type { SystemRoleKey } from "../authorization.constants";

export const ROLES_KEY = "ggs:roles";

export function Roles(...roles: SystemRoleKey[]) {
  return SetMetadata(ROLES_KEY, roles);
}


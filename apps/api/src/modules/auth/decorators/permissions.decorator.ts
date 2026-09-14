import { SetMetadata } from "@nestjs/common";

import type { PermissionKey } from "../authorization.constants";

export const PERMISSIONS_KEY = "ggs:permissions";

export function Permissions(...permissions: PermissionKey[]) {
  return SetMetadata(PERMISSIONS_KEY, permissions);
}


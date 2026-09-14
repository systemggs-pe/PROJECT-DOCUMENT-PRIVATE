import { Inject, Injectable } from "@nestjs/common";

import { PrismaService } from "../../../common/database/prisma.service";
import { ROLE_PERMISSION_MAP, SYSTEM_ROLES, type PermissionKey, type SystemRoleKey } from "../authorization.constants";

export interface RoleSummary {
  id: string;
  key: string;
  name: string;
  isSystem: boolean;
}

export interface AuthorizationSnapshot {
  roles: RoleSummary[];
  permissions: PermissionKey[];
}

@Injectable()
export class AuthorizationService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async getSnapshot(userId: string): Promise<AuthorizationSnapshot> {
    const user = await this.prisma.client.user.findUnique({
      where: { id: userId },
      select: {
        userRoles: {
          where: { role: { isActive: true } },
          select: {
            role: {
              select: {
                id: true,
                key: true,
                name: true,
                isSystem: true,
                rolePermissions: { select: { permission: { select: { key: true } } } },
              },
            },
          },
        },
      },
    });

    const roles = user?.userRoles.map(({ role }) => ({ id: role.id, key: role.key, name: role.name, isSystem: role.isSystem })) ?? [];
    const permissions = new Set<PermissionKey>();
    for (const assignment of user?.userRoles ?? []) {
      for (const item of assignment.role.rolePermissions) {
        permissions.add(item.permission.key as PermissionKey);
      }
    }

    return { roles, permissions: [...permissions].sort() };
  }

  hasRole(snapshot: AuthorizationSnapshot, role: SystemRoleKey | string): boolean {
    return snapshot.roles.some((item) => item.key === role);
  }

  hasAnyRole(snapshot: AuthorizationSnapshot, roles: readonly (SystemRoleKey | string)[]): boolean {
    return roles.length === 0 || roles.some((role) => this.hasRole(snapshot, role));
  }

  hasPermission(snapshot: AuthorizationSnapshot, permission: PermissionKey): boolean {
    return this.isSuperAdmin(snapshot) || snapshot.permissions.includes(permission);
  }

  hasAnyPermission(snapshot: AuthorizationSnapshot, permissions: readonly PermissionKey[]): boolean {
    return permissions.length === 0 || permissions.some((permission) => this.hasPermission(snapshot, permission));
  }

  hasAllPermissions(snapshot: AuthorizationSnapshot, permissions: readonly PermissionKey[]): boolean {
    return permissions.every((permission) => this.hasPermission(snapshot, permission));
  }

  isSuperAdmin(snapshot: AuthorizationSnapshot): boolean {
    return this.hasRole(snapshot, SYSTEM_ROLES.SUPERADMIN);
  }

  async ensureSystemCatalog(): Promise<void> {
    await this.prisma.client.$transaction(async (tx) => {
      const permissions = Object.values(ROLE_PERMISSION_MAP).flat();
      for (const key of [...new Set(permissions)]) {
        await tx.permission.upsert({
          where: { key },
          update: { name: humanizePermission(key), metadata: { group: key.split(".")[0] } },
          create: { key, name: humanizePermission(key), metadata: { group: key.split(".")[0] } },
        });
      }

      for (const [key, permissionKeys] of Object.entries(ROLE_PERMISSION_MAP) as Array<[SystemRoleKey, PermissionKey[]]>) {
        const role = await tx.role.upsert({
          where: { key },
          update: { name: roleName(key), isSystem: true, isActive: true },
          create: { key, name: roleName(key), isSystem: true, isActive: true },
        });
        const existingPermissions = await tx.permission.findMany({ where: { key: { in: permissionKeys } }, select: { id: true } });
        await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
        await tx.rolePermission.createMany({
          data: existingPermissions.map((permission) => ({ roleId: role.id, permissionId: permission.id })),
          skipDuplicates: true,
        });
      }
    });
  }
}

function humanizePermission(key: string) {
  const [resource = "permiso", action = "usar"] = key.split(".");
  return `${resource.replaceAll("_", " ")} ${action}`;
}

function roleName(key: SystemRoleKey) {
  return key === "SUPERADMIN" ? "Superadministrador" : key === "ADMIN" ? "Administrador" : "Usuario";
}

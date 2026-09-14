import { ConflictException, ForbiddenException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import type { PrismaService } from "../../common/database/prisma.service";
import type { CurrentUser } from "../auth/types/current-user";
import { RolesService } from "./roles.service";

describe("RolesService RBAC protections", () => {
  it("rejects ADMIN editing system roles", async () => {
    const service = new RolesService(prisma({ role: { findFirst: vi.fn().mockResolvedValue({ id: "role-admin", key: "ADMIN", isSystem: true, rolePermissions: [], _count: { userRoles: 0, rolePermissions: 0 } }) } }));
    await expect(service.update(actor("admin-id", ["ADMIN"]), "role-admin", { name: "Admin editado" })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("rejects ADMIN editing SUPERADMIN", async () => {
    const service = new RolesService(prisma({ role: { findFirst: vi.fn().mockResolvedValue({ id: "role-super", key: "SUPERADMIN", isSystem: true, rolePermissions: [], _count: { userRoles: 0, rolePermissions: 0 } }) } }));
    await expect(service.update(actor("admin-id", ["ADMIN"]), "role-super", { name: "Nope" })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("rejects deleting an assigned custom role", async () => {
    const service = new RolesService(prisma({ role: { findFirst: vi.fn().mockResolvedValue({ id: "role-editor", key: "EDITOR", isSystem: false, organizationId: null, _count: { userRoles: 1 } }) } }));
    await expect(service.remove(actor("super-id", ["SUPERADMIN"]), "role-editor")).rejects.toBeInstanceOf(ConflictException);
  });
});

function prisma(client: unknown) {
  return { client } as PrismaService;
}

function actor(id: string, roleKeys: string[]): CurrentUser {
  const roles = roleKeys.map((key) => ({ id: key, key, name: key, isSystem: true }));
  return { id, authProviderId: id, email: `${id}@example.com`, name: null, avatarUrl: null, isActive: true, status: "ACTIVE", organizationId: "org-a", organization: { id: "org-a", name: "Org A", slug: "org-a", status: "ACTIVE" }, roles, permissions: [], authorization: { roles, permissions: [] } };
}

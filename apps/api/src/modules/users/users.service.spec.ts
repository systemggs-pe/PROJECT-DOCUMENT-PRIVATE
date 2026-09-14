import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import type { PrismaService } from "../../common/database/prisma.service";
import type { AuthorizationService } from "../auth/services/authorization.service";
import type { CurrentUser } from "../auth/types/current-user";
import { UsersService } from "./users.service";

describe("UsersService RBAC protections", () => {
  it("rejects self role modification", async () => {
    const service = new UsersService(prisma({ user: { findFirst: vi.fn().mockResolvedValue(target("admin-id", ["ADMIN"])) } }), authorization(false));
    await expect(service.replaceRoles(actor("admin-id", ["ADMIN"]), "admin-id", { roleIds: ["11111111-1111-4111-8111-111111111111"] })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("rejects ADMIN assigning SUPERADMIN", async () => {
    const tx = { role: { findMany: vi.fn().mockResolvedValue([{ id: "super-role", key: "SUPERADMIN" }]) } };
    const service = new UsersService(prisma({ user: { findFirst: vi.fn().mockResolvedValue(target("user-id", ["USER"])) }, $transaction: vi.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx)) }), authorization(false));
    await expect(service.replaceRoles(actor("admin-id", ["ADMIN"]), "user-id", { roleIds: ["11111111-1111-4111-8111-111111111111"] })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("hides users outside scope", async () => {
    const service = new UsersService(prisma({ user: { findFirst: vi.fn().mockResolvedValue(null) } }), authorization(false));
    await expect(service.findOne(actor("admin-id", ["ADMIN"]), "other-user-id")).rejects.toBeInstanceOf(NotFoundException);
  });
});

function prisma(client: unknown) {
  return { client } as PrismaService;
}

function authorization(isSuperAdmin: boolean) {
  return { isSuperAdmin: vi.fn().mockReturnValue(isSuperAdmin) } as unknown as AuthorizationService;
}

function actor(id: string, roleKeys: string[]): CurrentUser {
  const roles = roleKeys.map((key) => ({ id: key, key, name: key, isSystem: true }));
  return { id, authProviderId: id, email: `${id}@example.com`, name: null, avatarUrl: null, isActive: true, status: "ACTIVE", organizationId: "org-a", organization: { id: "org-a", name: "Org A", slug: "org-a", status: "ACTIVE" }, roles, permissions: [], authorization: { roles, permissions: [] } };
}

function target(id: string, roleKeys: string[]) {
  return { id, isActive: true, userRoles: roleKeys.map((key) => ({ role: { id: key, key, name: key, isSystem: true } })) };
}

import { ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
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

  it("rejects ADMIN assigning ADMIN", async () => {
    const tx = { role: { findMany: vi.fn().mockResolvedValue([{ id: "admin-role", key: "ADMIN" }]) } };
    const service = new UsersService(prisma({ user: { findFirst: vi.fn().mockResolvedValue(target("user-id", ["USER"])) }, $transaction: vi.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx)) }), authorization(false));
    await expect(service.replaceRoles(actor("admin-id", ["ADMIN"]), "user-id", { roleIds: ["11111111-1111-4111-8111-111111111111"] })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("rejects deactivating the last active SUPERADMIN", async () => {
    const tx = { user: { count: vi.fn().mockResolvedValue(0), update: vi.fn() }, auditLog: { create: vi.fn() } };
    const service = new UsersService(prisma({ user: { findFirst: vi.fn().mockResolvedValue(target("super-id", ["SUPERADMIN"])) }, $transaction: vi.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx)) }), authorization(true));
    await expect(service.deactivate(actor("other-super-id", ["SUPERADMIN"]), "super-id")).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("rejects removing SUPERADMIN from the last active SUPERADMIN", async () => {
    const tx = {
      role: { findMany: vi.fn().mockResolvedValueOnce([{ id: "user-role", key: "USER" }]).mockResolvedValueOnce([{ key: "USER" }]) },
      user: { count: vi.fn().mockResolvedValue(0) },
      userRole: { findMany: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn() },
      auditLog: { create: vi.fn() },
    };
    const service = new UsersService(prisma({ user: { findFirst: vi.fn().mockResolvedValue(target("super-id", ["SUPERADMIN"])) }, $transaction: vi.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx)) }), authorization(true));
    await expect(service.replaceRoles(actor("other-super-id", ["SUPERADMIN"]), "super-id", { roleIds: ["11111111-1111-4111-8111-111111111111"] })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("rejects duplicate emails on user creation", async () => {
    const tx = {
      role: { findMany: vi.fn().mockResolvedValue([]) },
      user: { findUnique: vi.fn().mockResolvedValue({ id: "existing" }), create: vi.fn() },
      auditLog: { create: vi.fn() },
    };
    const service = new UsersService(prisma({ $transaction: vi.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx)) }), authorization(true));
    await expect(service.create(actor("super-id", ["SUPERADMIN"]), { email: "taken@example.com", roleIds: [] })).rejects.toBeInstanceOf(ConflictException);
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
  return { id, authProviderId: id, email: `${id}@example.com`, name: null, avatarUrl: null, isActive: true, status: "ACTIVE", roles, permissions: [], authorization: { roles, permissions: [] } };
}

function target(id: string, roleKeys: string[]) {
  return { id, isActive: true, userRoles: roleKeys.map((key) => ({ role: { id: key, key, name: key, isSystem: true } })) };
}


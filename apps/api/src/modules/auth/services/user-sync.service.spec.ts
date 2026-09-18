import { ForbiddenException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import type { PrismaService } from "../../../common/database/prisma.service";
import type { AuthorizationService } from "./authorization.service";
import { UserSyncService } from "./user-sync.service";

describe("UserSyncService", () => {
  it("creates or updates the authenticated user by authProviderId", async () => {
    const syncedUser = activeUser({ userRoles: [] });
    const upsert = vi.fn().mockResolvedValue(syncedUser);
    const findUnique = vi.fn().mockResolvedValue({ id: "role-user-id" });
    const create = vi.fn().mockResolvedValue({});
    const transaction = vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback({ user: { upsert }, role: { findUnique }, userRole: { create }, auditLog: { create: vi.fn() } }));
    const authorization = { getSnapshot: vi.fn().mockResolvedValue({ roles: [{ id: "role-user-id", key: "USER", name: "Usuario", isSystem: true }], permissions: ["generations.read"] }) } as unknown as AuthorizationService;
    const service = new UserSyncService({ client: { $transaction: transaction } } as unknown as PrismaService, { get: vi.fn().mockReturnValue("") } as never, authorization);

    await expect(service.sync({ authProviderId: syncedUser.authProviderId, email: syncedUser.email, name: syncedUser.name, avatarUrl: null })).resolves.toMatchObject({
      id: syncedUser.id,
      email: syncedUser.email,
      isActive: true,
      roles: [{ key: "USER" }],
    });
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { authProviderId: syncedUser.authProviderId } }));
    expect(create).toHaveBeenCalledWith({ data: { userId: syncedUser.id, roleId: "role-user-id" } });
  });

  it("rejects an inactive local user with 403", async () => {
    const upsert = vi.fn().mockResolvedValue(activeUser({ isActive: false, userRoles: [] }));
    const transaction = vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback({ user: { upsert }, role: { findUnique: vi.fn() }, userRole: { create: vi.fn() }, auditLog: { create: vi.fn() } }));
    const service = new UserSyncService({ client: { $transaction: transaction } } as unknown as PrismaService, { get: vi.fn().mockReturnValue("") } as never, { getSnapshot: vi.fn() } as unknown as AuthorizationService);

    await expect(service.sync({ authProviderId: "auth-id", email: "user@example.com", name: null, avatarUrl: null })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("uses SUPERADMIN role when the configured bootstrap email matches", async () => {
    const syncedUser = activeUser({ email: "admin@example.com", userRoles: [] });
    const findUnique = vi.fn().mockResolvedValue({ id: "role-superadmin-id" });
    const create = vi.fn().mockResolvedValue({});
    const transaction = vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback({ user: { upsert: vi.fn().mockResolvedValue(syncedUser) }, role: { findUnique }, userRole: { create }, auditLog: { create: vi.fn() } }));
    const authorization = { getSnapshot: vi.fn().mockResolvedValue({ roles: [{ id: "role-superadmin-id", key: "SUPERADMIN", name: "Superadministrador", isSystem: true }], permissions: ["company.update"] }) } as unknown as AuthorizationService;
    const config = { get: vi.fn((key: string) => key === "SUPERADMIN_EMAIL" ? "admin@example.com" : "") };
    const service = new UserSyncService({ client: { $transaction: transaction } } as unknown as PrismaService, config as never, authorization);

    await expect(service.sync({ authProviderId: syncedUser.authProviderId, email: "admin@example.com", name: "Admin", avatarUrl: null })).resolves.toMatchObject({
      roles: [{ key: "SUPERADMIN" }],
    });
    expect(findUnique).toHaveBeenCalledWith({ where: { key: "SUPERADMIN" }, select: { id: true } });
    expect(create).toHaveBeenCalledWith({ data: { userId: syncedUser.id, roleId: "role-superadmin-id" } });
  });
});

function activeUser(overrides: Partial<{ authProviderId: string; email: string; name: string | null; avatarUrl: string | null; isActive: boolean; userRoles: unknown[] }> = {}) {
  return {
    id: "local-user-id",
    authProviderId: "auth-id",
    email: "user@example.com",
    name: "Ada",
    avatarUrl: null,
    isActive: true,
    userRoles: [{ id: "user-role-id" }],
    ...overrides,
  };
}

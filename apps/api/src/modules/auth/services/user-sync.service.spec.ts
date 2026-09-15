import { ForbiddenException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import type { PrismaService } from "../../../common/database/prisma.service";
import type { AuthorizationService } from "./authorization.service";
import { UserSyncService } from "./user-sync.service";

describe("UserSyncService", () => {
  it("creates or updates the authenticated user by authProviderId", async () => {
    const syncedUser = {
      id: "local-user-id",
      authProviderId: "4eb77b04-1389-48df-8d3c-e7de38e63f7c",
      email: "user@example.com",
      name: "Ada",
      avatarUrl: null,
      isActive: true,
      organizationId: "org-a",
      organization: { id: "org-a", name: "Org A", slug: "org-a", status: "ACTIVE" },
      userRoles: [],
    };
    const upsert = vi.fn().mockResolvedValue(syncedUser);
    const findUnique = vi.fn().mockResolvedValue({ id: "role-user-id" });
    const create = vi.fn().mockResolvedValue({});
    const auditCreate = vi.fn().mockResolvedValue({});
    const transaction = vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback({ user: { upsert, update: vi.fn() }, organization: { upsert: vi.fn().mockResolvedValue({ id: "org-a", name: "Org A", slug: "org-a", status: "ACTIVE" }) }, role: { findUnique }, userRole: { create }, auditLog: { create: auditCreate } }));
    const authorization = { getSnapshot: vi.fn().mockResolvedValue({ roles: [{ id: "role-user-id", key: "USER", name: "Usuario", isSystem: true }], permissions: ["generations.read"] }) } as unknown as AuthorizationService;
    const service = new UserSyncService({ client: { $transaction: transaction } } as unknown as PrismaService, { get: vi.fn().mockReturnValue("") } as never, authorization);

    await expect(
      service.sync({
        authProviderId: "4eb77b04-1389-48df-8d3c-e7de38e63f7c",
        email: "user@example.com",
        name: "Ada",
        avatarUrl: null,
      }),
    ).resolves.toMatchObject({
      id: "local-user-id",
      authProviderId: "4eb77b04-1389-48df-8d3c-e7de38e63f7c",
      email: "user@example.com",
      isActive: true,
    });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          authProviderId: "4eb77b04-1389-48df-8d3c-e7de38e63f7c",
        },
      }),
    );
    expect(create).toHaveBeenCalledWith({ data: { userId: "local-user-id", roleId: "role-user-id" } });
  });

  it("rejects an inactive local user with 403", async () => {
    const upsert = vi.fn().mockResolvedValue({
      id: "local-user-id",
      authProviderId: "4eb77b04-1389-48df-8d3c-e7de38e63f7c",
      email: "user@example.com",
      name: null,
      avatarUrl: null,
      isActive: false,
      organizationId: "org-a",
      organization: { id: "org-a", name: "Org A", slug: "org-a", status: "ACTIVE" },
      userRoles: [],
    });
    const findUnique = vi.fn().mockResolvedValue({ id: "role-user-id" });
    const transaction = vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback({ user: { upsert, update: vi.fn() }, organization: { upsert: vi.fn().mockResolvedValue({ id: "org-a", name: "Org A", slug: "org-a", status: "ACTIVE" }) }, role: { findUnique }, userRole: { create: vi.fn() }, auditLog: { create: vi.fn() } }));
    const authorization = { getSnapshot: vi.fn() } as unknown as AuthorizationService;
    const service = new UserSyncService({ client: { $transaction: transaction } } as unknown as PrismaService, { get: vi.fn().mockReturnValue("") } as never, authorization);

    await expect(
      service.sync({
        authProviderId: "4eb77b04-1389-48df-8d3c-e7de38e63f7c",
        email: "user@example.com",
        name: null,
        avatarUrl: null,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("assigns the default active organization to an existing user without organization", async () => {
    const organization = { id: "org-default", name: "Organization Demo", slug: "demo-organization", status: "ACTIVE" };
    const syncedUser = {
      id: "local-user-id",
      authProviderId: "4eb77b04-1389-48df-8d3c-e7de38e63f7c",
      email: "admin@example.com",
      name: "Admin",
      avatarUrl: null,
      isActive: true,
      organizationId: null,
      organization: null,
      userRoles: [{ id: "user-role-id" }],
    };
    const updatedUser = { ...syncedUser, organizationId: organization.id, organization };
    const update = vi.fn().mockResolvedValue(updatedUser);
    const transaction = vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback({
      user: { upsert: vi.fn().mockResolvedValue(syncedUser), update },
      organization: { upsert: vi.fn().mockResolvedValue(organization) },
      role: { findUnique: vi.fn() },
      userRole: { create: vi.fn() },
      auditLog: { create: vi.fn() },
    }));
    const authorization = { getSnapshot: vi.fn().mockResolvedValue({ roles: [{ id: "role-superadmin-id", key: "SUPERADMIN", name: "Superadministrador", isSystem: true }], permissions: ["generations.create"] }) } as unknown as AuthorizationService;
    const config = { get: vi.fn((key: string) => key === "SUPERADMIN_EMAIL" ? "admin@example.com" : "") };
    const service = new UserSyncService({ client: { $transaction: transaction } } as unknown as PrismaService, config as never, authorization);

    await expect(
      service.sync({
        authProviderId: "4eb77b04-1389-48df-8d3c-e7de38e63f7c",
        email: "admin@example.com",
        name: "Admin",
        avatarUrl: null,
      }),
    ).resolves.toMatchObject({
      organizationId: "org-default",
      organization,
      roles: [{ key: "SUPERADMIN" }],
    });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: { organizationId: "org-default" } }));
  });
});

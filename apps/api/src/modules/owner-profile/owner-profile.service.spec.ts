import { describe, expect, it, vi } from "vitest";

import type { PrismaService } from "../../common/database/prisma.service";
import type { CurrentUser } from "../auth/types/current-user";
import { OwnerProfileService } from "./owner-profile.service";

describe("OwnerProfileService", () => {
  it("loads the singleton owner profile through upsert", async () => {
    const upsert = vi.fn().mockResolvedValue(ownerProfileRecord());
    const service = new OwnerProfileService({ client: { ownerProfile: { upsert } } } as unknown as PrismaService);

    await expect(service.get()).resolves.toMatchObject({ id: "global", fullName: "" });
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "global" }, create: expect.objectContaining({ id: "global", fullName: "" }) }));
  });

  it("updates only allowed fields and records audit metadata", async () => {
    const tx = {
      ownerProfile: { upsert: vi.fn().mockResolvedValue(ownerProfileRecord({ fullName: "Maria Gomez", phone: "+51 999 999 999" })) },
      auditLog: { create: vi.fn() },
    };
    const service = new OwnerProfileService({ client: { $transaction: vi.fn((callback: (transaction: typeof tx) => unknown) => callback(tx)) } } as unknown as PrismaService);

    await expect(service.update(actor(), { fullName: "Maria Gomez", phone: "+51 999 999 999" })).resolves.toMatchObject({ fullName: "Maria Gomez", phone: "+51 999 999 999" });
    expect(tx.ownerProfile.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "global" },
      update: expect.objectContaining({ fullName: "Maria Gomez", phone: "+51 999 999 999" }),
    }));
    expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        entityType: "OWNER_PROFILE",
        metadata: expect.objectContaining({ event: "OWNER_PROFILE_UPDATED", fields: ["fullName", "phone"] }),
      }),
    }));
  });

  it("rejects old business fields", async () => {
    const service = new OwnerProfileService({ client: { $transaction: vi.fn() } } as unknown as PrismaService);

    await expect(service.update(actor(), { legalName: "Negocio SAC" })).rejects.toThrow("Los datos del titular no son validos.");
  });
});

function ownerProfileRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "global",
    fullName: "",
    email: null,
    phone: null,
    createdAt: new Date("2026-09-18T00:00:00Z"),
    updatedAt: new Date("2026-09-18T00:00:00Z"),
    ...overrides,
  };
}

function actor(): CurrentUser {
  const roles = [{ id: "SUPERADMIN", key: "SUPERADMIN", name: "Superadministrador", isSystem: true }];
  return { id: "user-id", authProviderId: "auth-id", email: "admin@example.com", name: null, avatarUrl: null, isActive: true, status: "ACTIVE", roles, permissions: [], authorization: { roles, permissions: [] } };
}

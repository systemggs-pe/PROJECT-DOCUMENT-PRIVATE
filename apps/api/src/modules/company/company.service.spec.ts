import { NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import type { PrismaService } from "../../common/database/prisma.service";
import type { CurrentUser } from "../auth/types/current-user";
import { CompanyService } from "./company.service";

describe("CompanyService", () => {
  it("loads the singleton company settings through upsert", async () => {
    const upsert = vi.fn().mockResolvedValue(companyRecord());
    const service = new CompanyService({ client: { companySettings: { upsert } } } as unknown as PrismaService);

    await expect(service.get()).resolves.toMatchObject({ id: "global", name: "Empresa", displayName: "Empresa" });
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "global" }, create: expect.objectContaining({ id: "global" }) }));
  });

  it("updates only allowed fields and records audit metadata", async () => {
    const tx = {
      companySettings: { upsert: vi.fn().mockResolvedValue(companyRecord({ name: "Nueva Empresa", city: "Lima" })) },
      storedFile: { findFirst: vi.fn() },
      auditLog: { create: vi.fn() },
    };
    const service = new CompanyService({ client: { $transaction: vi.fn((callback: (transaction: typeof tx) => unknown) => callback(tx)) } } as unknown as PrismaService);

    await expect(service.update(actor(), { name: "Nueva Empresa", city: "Lima" })).resolves.toMatchObject({ name: "Nueva Empresa", city: "Lima" });
    expect(tx.companySettings.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "global" },
      update: expect.objectContaining({ name: "Nueva Empresa", city: "Lima" }),
    }));
    expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ metadata: expect.objectContaining({ event: "COMPANY_SETTINGS_UPDATED", fields: ["name", "city"] }) }) }));
  });

  it("rejects logoFileId when the file is missing or not an image", async () => {
    const tx = {
      companySettings: { upsert: vi.fn() },
      storedFile: { findFirst: vi.fn().mockResolvedValue(null) },
      auditLog: { create: vi.fn() },
    };
    const service = new CompanyService({ client: { $transaction: vi.fn((callback: (transaction: typeof tx) => unknown) => callback(tx)) } } as unknown as PrismaService);

    await expect(service.update(actor(), { logoFileId: "11111111-1111-4111-8111-111111111111" })).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.companySettings.upsert).not.toHaveBeenCalled();
  });
});

function companyRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "global",
    name: "Empresa",
    tradeName: null,
    legalName: null,
    documentNumber: null,
    email: null,
    phone: null,
    website: null,
    address: null,
    city: null,
    region: null,
    country: "Peru",
    logoUrl: null,
    logoFileId: null,
    logoFile: null,
    description: null,
    slogan: null,
    footerText: null,
    metadata: {},
    createdAt: new Date("2026-09-18T00:00:00Z"),
    updatedAt: new Date("2026-09-18T00:00:00Z"),
    ...overrides,
  };
}

function actor(): CurrentUser {
  const roles = [{ id: "SUPERADMIN", key: "SUPERADMIN", name: "Superadministrador", isSystem: true }];
  return { id: "user-id", authProviderId: "auth-id", email: "admin@example.com", name: null, avatarUrl: null, isActive: true, status: "ACTIVE", roles, permissions: [], authorization: { roles, permissions: [] } };
}

import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import type { PrismaService } from "../../common/database/prisma.service";
import type { CurrentUser } from "../auth/types/current-user";
import { TemplatesService } from "./templates.service";

describe("TemplatesService", () => {
  it("lists only templates owned by the current user", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const count = vi.fn().mockResolvedValue(0);
    const transaction = vi.fn().mockResolvedValue([[], 0]);
    const service = new TemplatesService({ client: { template: { findMany, count }, $transaction: transaction } } as unknown as PrismaService);

    await expect(service.listOwned(actor("user-a"))).resolves.toMatchObject({ items: [], page: 1, pageSize: 20, total: 0, totalPages: 0 });

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { createdById: "user-a" } }));
    expect(count).toHaveBeenCalledWith({ where: { createdById: "user-a" } });
    expect(transaction).toHaveBeenCalledOnce();
  });

  it("validates safe filters and rejects arbitrary sorting", async () => {
    const service = new TemplatesService({ client: { template: { findMany: vi.fn(), count: vi.fn() }, $transaction: vi.fn().mockResolvedValue([[], 0]) } } as unknown as PrismaService);

    await expect(service.listOwned(actor("user-a"), { search: "DNI", status: "ACTIVE", sortBy: "name", sortOrder: "asc", page: "2", pageSize: "10" })).resolves.toMatchObject({ page: 2, pageSize: 10 });
    await expect(service.listOwned(actor("user-a"), { sortBy: "createdById" })).rejects.toBeInstanceOf(BadRequestException);
  });

  it("returns 404 for missing or foreign templates", async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const service = new TemplatesService({ client: { template: { findFirst } } } as unknown as PrismaService);

    await expect(service.findOwnedOrThrow("template-b", actor("user-a"))).rejects.toBeInstanceOf(NotFoundException);
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "template-b", createdById: "user-a" } }));
  });

  it("permanently deletes templates without generated documents", async () => {
    const tx = {
      template: { findFirst: vi.fn().mockResolvedValue({ id: "template-a" }), delete: vi.fn().mockResolvedValue({}) },
      generation: { count: vi.fn().mockResolvedValue(0) },
      templateVersion: { findMany: vi.fn().mockResolvedValue([{ id: "version-a" }]), deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
      templateElement: { deleteMany: vi.fn().mockResolvedValue({ count: 2 }) },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    const transaction = vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx));
    const service = new TemplatesService({ client: { $transaction: transaction } } as unknown as PrismaService);

    await expect(service.remove("template-a", actor("user-a"))).resolves.toEqual({ deleted: true, id: "template-a" });

    expect(tx.template.findFirst).toHaveBeenCalledWith({ where: { id: "template-a", createdById: "user-a" }, select: { id: true } });
    expect(tx.generation.count).toHaveBeenCalledWith({ where: { templateId: "template-a" } });
    expect(tx.templateElement.deleteMany).toHaveBeenCalledWith({ where: { templateVersionId: { in: ["version-a"] } } });
    expect(tx.templateVersion.deleteMany).toHaveBeenCalledWith({ where: { templateId: "template-a" } });
    expect(tx.template.delete).toHaveBeenCalledWith({ where: { id: "template-a" } });
  });

  it("blocks permanent deletion when the template has generated documents", async () => {
    const tx = {
      template: { findFirst: vi.fn().mockResolvedValue({ id: "template-a" }), delete: vi.fn() },
      generation: { count: vi.fn().mockResolvedValue(1) },
      templateVersion: { findMany: vi.fn(), deleteMany: vi.fn() },
      templateElement: { deleteMany: vi.fn() },
      auditLog: { create: vi.fn() },
    };
    const transaction = vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx));
    const service = new TemplatesService({ client: { $transaction: transaction } } as unknown as PrismaService);

    await expect(service.remove("template-a", actor("user-a"))).rejects.toBeInstanceOf(ConflictException);
    expect(tx.template.delete).not.toHaveBeenCalled();
    expect(tx.templateVersion.deleteMany).not.toHaveBeenCalled();
  });
});

function actor(id: string): CurrentUser {
  const roles = [{ id: "USER", key: "USER", name: "Usuario", isSystem: true }];
  return { id, authProviderId: id, email: `${id}@example.com`, name: null, avatarUrl: null, isActive: true, status: "ACTIVE", roles, permissions: [], authorization: { roles, permissions: [] } };
}



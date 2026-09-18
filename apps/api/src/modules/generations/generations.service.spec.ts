import { NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import type { PrismaService } from "../../common/database/prisma.service";
import type { CurrentUser } from "../auth/types/current-user";
import { GenerationsService } from "./generations.service";

const companyId = "22222222-2222-4222-8222-222222222222";

describe("GenerationsService", () => {
  it("queries generations through current-user ownership", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const findFirst = vi.fn().mockResolvedValue(null);
    const count = vi.fn().mockResolvedValue(0);
    const service = new GenerationsService({
      client: { generation: { findMany, findFirst, count }, $transaction: vi.fn((operations: Promise<unknown>[]) => Promise.all(operations)) },
    } as unknown as PrismaService);

    await service.listOwned(actor("user-a"));
    await expect(service.findOwnedOrThrow("generation-b", actor("user-a"))).rejects.toBeInstanceOf(NotFoundException);

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { createdById: "user-a" } }));
    expect(count).toHaveBeenCalledWith(expect.objectContaining({ where: { createdById: "user-a" } }));
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "generation-b", createdById: "user-a" } }),
    );
  });

  it("builds server-side filters, date range and whitelist sorting", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const count = vi.fn().mockResolvedValue(0);
    const service = new GenerationsService({ client: { generation: { findMany, count }, $transaction: vi.fn((operations: Promise<unknown>[]) => Promise.all(operations)) } } as unknown as PrismaService);

    await service.listOwned(actor("user-a"), { search: "GGS-4", status: "FAILED", templateId: "11111111-1111-4111-8111-111111111111", from: "2026-09-01", to: "2026-09-14", sort: "number", order: "asc", page: "2", pageSize: "20" });

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ orderBy: { number: "asc" }, skip: 20, take: 20, where: expect.objectContaining({ createdById: "user-a", status: "FAILED", templateId: "11111111-1111-4111-8111-111111111111", OR: expect.any(Array), createdAt: expect.objectContaining({ gte: expect.any(Date), lt: expect.any(Date) }) }) }));
    expect(count).toHaveBeenCalledOnce();
  });

  it("deletes only a finished owned generation and preserves the audit event", async () => {
    const tx = {
      generationAttachment: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
      generationInput: { count: vi.fn().mockResolvedValue(0), deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
      generation: { delete: vi.fn().mockResolvedValue({}) },
      storedFile: { delete: vi.fn().mockResolvedValue({}) },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    const storage = { bucket: "ggs-documents", remove: vi.fn().mockResolvedValue(undefined) };
    const prisma = {
      client: {
        generation: { findFirst: vi.fn().mockResolvedValue({ id: "generation-a", number: "GGS-000001", status: "COMPLETED", outputFileId: "file-a", outputFile: { storageKey: `organizations/${companyId}/generations/generation-a.pdf`, bucket: "ggs-documents", type: "PDF" } }) },
        $transaction: vi.fn(async (callback: (value: typeof tx) => unknown) => callback(tx)),
      },
    };
    const service = new GenerationsService(prisma as unknown as PrismaService, storage as never);

    await expect(service.removeOwned("generation-a", actor("user-a"))).resolves.toEqual({ deleted: true, id: "generation-a" });
    expect(tx.generationAttachment.deleteMany).toHaveBeenCalledWith({ where: { generationId: "generation-a" } });
    expect(tx.generationInput.deleteMany).toHaveBeenCalledWith({ where: { generationId: "generation-a" } });
    expect(tx.generation.delete).toHaveBeenCalledWith({ where: { id: "generation-a" } });
    expect(tx.storedFile.delete).toHaveBeenCalledWith({ where: { id: "file-a" } });
    expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "DELETE", entityType: "GENERATION" }) }));
    expect(storage.remove).toHaveBeenCalledWith(`organizations/${companyId}/generations/generation-a.pdf`);
  });
});

function actor(id: string): CurrentUser {
  const roles = [{ id: "USER", key: "USER", name: "Usuario", isSystem: true }];
  return { id, authProviderId: id, email: `${id}@example.com`, name: null, avatarUrl: null, isActive: true, status: "ACTIVE", roles, permissions: [], authorization: { roles, permissions: [] } };
}



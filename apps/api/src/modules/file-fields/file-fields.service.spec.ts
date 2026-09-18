import { ConflictException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import type { PrismaService } from "../../common/database/prisma.service";
import { FileFieldsService } from "./file-fields.service";

describe("FileFieldsService", () => {
  it("creates custom fields with generated stable keys and audit", async () => {
    const tx = mockTx({ findUnique: vi.fn().mockResolvedValue(null) });
    const service = new FileFieldsService({ client: { $transaction: vi.fn((callback: (transaction: typeof tx) => unknown) => callback(tx)) } } as unknown as PrismaService);

    const result = await service.create(actor(), { label: "Contrato firmado", acceptedMimeTypes: ["application/pdf"], maxFiles: 1, maxFileSize: 1024 });

    expect(result.key).toBe("contrato_firmado");
    expect(tx.fileField.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ source: "CUSTOM", acceptedMimeTypes: ["application/pdf"] }) }));
    expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ metadata: expect.objectContaining({ event: "FILE_FIELD_CREATED" }) }) }));
  });

  it("prevents deleting system fields", async () => {
    const tx = mockTx({ existing: { source: "SYSTEM" } });
    const service = new FileFieldsService({ client: { $transaction: vi.fn((callback: (transaction: typeof tx) => unknown) => callback(tx)) } } as unknown as PrismaService);

    await expect(service.remove(actor(), "11111111-1111-4111-8111-111111111111")).rejects.toBeInstanceOf(ConflictException);
  });

  it("deactivates custom fields when they have historical use", async () => {
    const tx = mockTx({ templateUses: 1, fileUses: 0 });
    const service = new FileFieldsService({ client: { $transaction: vi.fn((callback: (transaction: typeof tx) => unknown) => callback(tx)) } } as unknown as PrismaService);

    const result = await service.remove(actor(), "11111111-1111-4111-8111-111111111111");

    expect(result).toMatchObject({ deleted: false, deactivated: true });
    expect(tx.fileField.update).toHaveBeenCalledWith(expect.objectContaining({ data: { isActive: false } }));
  });
});

function mockTx(options: { findUnique?: ReturnType<typeof vi.fn>; existing?: Partial<{ source: "SYSTEM" | "CUSTOM" }>; templateUses?: number; fileUses?: number } = {}) {
  const field = { id: "11111111-1111-4111-8111-111111111111", key: "contrato_firmado", label: "Contrato firmado", source: options.existing?.source ?? "CUSTOM" };
  return {
    fileField: {
      findUnique: options.findUnique ?? vi.fn().mockResolvedValue(field),
      create: vi.fn().mockResolvedValue(field),
      update: vi.fn().mockResolvedValue({ ...field, isActive: false }),
      delete: vi.fn().mockResolvedValue(field),
    },
    templateElement: { count: vi.fn().mockResolvedValue(options.templateUses ?? 0) },
    storedFile: { count: vi.fn().mockResolvedValue(options.fileUses ?? 0) },
    auditLog: { create: vi.fn().mockResolvedValue({ id: "audit" }) },
  };
}

function actor() {
  return { id: "22222222-2222-4222-8222-222222222222" } as never;
}

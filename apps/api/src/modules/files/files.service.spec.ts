import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import type { PrismaService } from "../../common/database/prisma.service";
import type { CurrentUser } from "../auth/types/current-user";
import { FilesService } from "./files.service";
import type { StorageService } from "../storage/storage.service";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
const pdf = Buffer.from("%PDF-1.7\n%test\n");
const doc = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0x00, 0x00]);
const docx = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);
describe("FilesService", () => {
  it("uploads a validated image through backend-owned storage paths", async () => {
    const tx = {
      storedFile: { create: vi.fn(async ({ data }) => ({ ...data, createdAt: new Date("2026-09-14T00:00:00Z") })) },
      auditLog: { create: vi.fn() },
    };
    const prisma = {
      client: {
        $transaction: vi.fn((callback) => callback(tx)),
      },
    } as unknown as PrismaService;
    const storage = fakeStorage();
    const service = new FilesService(prisma, storage);
    const userId = randomUUID();
    const user = actor(userId);

    const uploaded = await service.upload(user, { buffer: png, originalname: "DNI frontal.png", mimetype: "image/png" });

    expect(uploaded).toMatchObject({ originalName: "DNI frontal.png", mimeType: "image/jpeg", type: "IMAGE", sizeBytes: expect.any(String), createdById: userId });
    expect(uploaded.storageKey).toMatch(/^company\/files\/[0-9a-f-]{36}\/original\.jpg$/);
    expect(storage.put).toHaveBeenCalledWith(uploaded.storageKey, expect.any(Buffer), "image/jpeg");
    expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "CREATE", entityType: "STORED_FILE" }) }));
  });

  it("rejects invalid file metadata before storage upload", async () => {
    const storage = fakeStorage();
    const service = new FilesService({ client: {} } as unknown as PrismaService, storage);

    await expect(service.upload(actor(randomUUID()), { buffer: Buffer.from("not an image"), originalname: "payload.svg", mimetype: "image/svg+xml" })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.upload(actor(randomUUID()), { buffer: Buffer.alloc(3 * 1024 * 1024 + 1), originalname: "large.jpg", mimetype: "image/jpeg" })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.upload(actor(randomUUID()), { buffer: Buffer.from("not an image"), originalname: "renamed.jpg", mimetype: "image/jpeg" })).rejects.toBeInstanceOf(BadRequestException);
    expect(storage.put).not.toHaveBeenCalled();
  });

  it("uploads PDFs unchanged and rejects Word before storage or metadata writes", async () => {
    const created: unknown[] = [];
    const tx = {
      storedFile: { create: vi.fn(async ({ data }) => { created.push(data); return { ...data, createdAt: new Date("2026-09-14T00:00:00Z") }; }) },
      auditLog: { create: vi.fn() },
    };
    const prisma = { client: { $transaction: vi.fn((callback) => callback(tx)) } } as unknown as PrismaService;
    const storage = fakeStorage();
    const service = new FilesService(prisma, storage);
    const user = actor(randomUUID());

    await expect(service.upload(user, { buffer: pdf, originalname: "contrato.pdf", mimetype: "application/pdf" })).resolves.toMatchObject({ type: "PDF", mimeType: "application/pdf", originalName: "contrato.pdf" });
    await expect(service.upload(user, { buffer: doc, originalname: "carta.doc", mimetype: "application/msword" })).rejects.toThrow("Word");
    await expect(service.upload(user, { buffer: docx, originalname: "informe.docx", mimetype: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" })).rejects.toThrow("Word");

    expect(storage.put).toHaveBeenCalledWith(expect.stringMatching(/original\.pdf$/), pdf, "application/pdf");
    expect(storage.put).toHaveBeenCalledTimes(1);
    expect(created).toHaveLength(1);
  });

  it("does not create metadata when storage upload fails", async () => {
    const prisma = { client: { $transaction: vi.fn() } } as unknown as PrismaService;
    const storage = fakeStorage();
    vi.mocked(storage.put).mockRejectedValueOnce(new Error("storage down"));
    const service = new FilesService(prisma, storage);

    await expect(service.upload(actor(randomUUID()), { buffer: png, originalname: "foto.png", mimetype: "image/png" })).rejects.toThrow();
    expect(prisma.client.$transaction).not.toHaveBeenCalled();
  });

  it("removes uploaded objects when database metadata creation fails", async () => {
    const prisma = {
      client: {
        $transaction: vi.fn().mockRejectedValueOnce(new Error("db down")),
      },
    } as unknown as PrismaService;
    const storage = fakeStorage();
    const service = new FilesService(prisma, storage);

    await expect(service.upload(actor(randomUUID()), { buffer: png, originalname: "foto.png", mimetype: "image/png" })).rejects.toThrow("db down");
    expect(storage.remove).toHaveBeenCalledWith(expect.stringMatching(/^company\/files\/.+\/original\.jpg$/));
  });

  it("lists files through current-user ownership and paginated filters", async () => {
    const findMany = vi.fn().mockResolvedValue([{ id: "file-a", createdById: "user-a", originalName: "foto.jpg", sizeBytes: 12n }]);
    const count = vi.fn().mockResolvedValue(1);
    const findFirst = vi.fn().mockResolvedValue(null);
    const service = new FilesService({ client: { $transaction: vi.fn(async (queries) => Promise.all(queries)), storedFile: { findMany, findFirst, count } } } as unknown as PrismaService);

    await expect(service.listOwned(actor("user-a"), { page: "2", pageSize: "10", search: "foto", type: "IMAGE", sortBy: "originalName", sortOrder: "asc" })).resolves.toMatchObject({
      items: [{ id: "file-a", createdById: "user-a", originalName: "foto.jpg", sizeBytes: "12" }],
      page: 2,
      pageSize: 10,
      total: 1,
    });
    await expect(service.findOwnedOrThrow("file-b", actor("user-a"))).rejects.toBeInstanceOf(NotFoundException);

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { createdById: "user-a", type: "IMAGE", originalName: { contains: "foto", mode: "insensitive" } },
      skip: 10,
      take: 10,
    }));
  });

  it("generates signed URLs and deletes only unused owned images", async () => {
    const file = { id: "file-a", createdById: "user-a", type: "IMAGE", storageKey: "company/files/file-a/original.jpg", bucket: "ggs-documents", mimeType: "image/jpeg", sizeBytes: 12n };
    const tx = { storedFile: { delete: vi.fn() }, auditLog: { create: vi.fn() } };
    const prisma = {
      client: {
        storedFile: { findFirst: vi.fn().mockResolvedValue(file) },
        generationInput: { count: vi.fn().mockResolvedValue(0) },
        generationAttachment: { count: vi.fn().mockResolvedValue(0) },
        generation: { count: vi.fn().mockResolvedValue(0) },
        auditLog: { create: vi.fn() },
        $transaction: vi.fn((value) => Array.isArray(value) ? Promise.all(value) : value(tx)),
      },
    } as unknown as PrismaService;
    const storage = fakeStorage();
    const service = new FilesService(prisma, storage);

    await expect(service.signedUrl("file-a", actor("user-a"))).resolves.toEqual({ url: "https://signed.local/file", expiresIn: 300 });
    await expect(service.removeUnused("file-a", actor("user-a"))).resolves.toEqual({ deleted: true });
    expect(storage.remove).toHaveBeenCalledWith(file.storageKey);
    expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "DELETE" }) }));
  });

  it("rejects deleting files referenced by historical generation inputs", async () => {
    const file = { id: "file-a", createdById: "user-a", type: "IMAGE", storageKey: "company/files/file-a/original.jpg", bucket: "ggs-documents", mimeType: "image/jpeg", sizeBytes: 12n };
    const service = new FilesService({
      client: {
        storedFile: { findFirst: vi.fn().mockResolvedValue(file) },
        generationInput: { count: vi.fn().mockResolvedValue(1) },
        generationAttachment: { count: vi.fn().mockResolvedValue(0) },
        generation: { count: vi.fn().mockResolvedValue(0) },
        $transaction: vi.fn((value) => Array.isArray(value) ? Promise.all(value) : value({})),
      },
    } as unknown as PrismaService, fakeStorage());

    await expect(service.removeUnused("file-a", actor("user-a"))).rejects.toBeInstanceOf(ConflictException);
  });
});

function actor(id: string): CurrentUser {
  const roles = [{ id: "USER", key: "USER", name: "Usuario", isSystem: true }];
  return { id, authProviderId: id, email: `${id}@example.com`, name: null, avatarUrl: null, isActive: true, status: "ACTIVE", roles, permissions: [], authorization: { roles, permissions: [] } };
}

function fakeStorage() {
  return {
    bucket: "ggs-documents",
    put: vi.fn(),
    read: vi.fn(),
    remove: vi.fn().mockResolvedValue(undefined),
    exists: vi.fn(),
    sign: vi.fn().mockResolvedValue("https://signed.local/file"),
  } as unknown as StorageService;
}



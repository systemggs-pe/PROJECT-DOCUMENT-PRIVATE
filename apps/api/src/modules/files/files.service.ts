import { BadRequestException, ConflictException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import sharp, { type OutputInfo } from "sharp";
import { z } from "zod";
import { StorageService } from "../storage/storage.service";

import { PrismaService } from "../../common/database/prisma.service";
import { requireTenant, resourceScope } from "../auth/tenant-context";
import type { CurrentUser } from "../auth/types/current-user";

const maxImageBytes = 10 * 1024 * 1024;
const signedUrlTtlSeconds = 300;
const allowedInputMimeTypes = ["image/jpeg", "image/png", "image/webp"] as const;
const allowedExtensions = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const filesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(12),
  search: z.string().trim().max(120).default(""),
  type: z.enum(["IMAGE", "PDF"]).optional(),
  sortBy: z.enum(["createdAt", "originalName", "sizeBytes"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
}).strict();

export type FilesQuery = z.infer<typeof filesQuerySchema>;

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService, @Inject(StorageService) private readonly storage?: StorageService) {}

  async upload(user: CurrentUser, file: { buffer: Buffer; originalname: string; mimetype: string } | undefined) {
    const organizationId = requireTenant(user);
    validateUpload(file);
    let normalized: { data: Buffer; info: OutputInfo };
    try {
      const image = sharp(file.buffer, { limitInputPixels: 20_000_000, failOn: "warning" });
      const metadata = await image.metadata();
      if (!["jpeg", "png", "webp"].includes(metadata.format ?? "") || (metadata.pages ?? 1) !== 1) throw new Error("Invalid image");
      normalized = await image.rotate().flatten({ background: "#ffffff" }).jpeg({ quality: 94 }).toBuffer({ resolveWithObject: true });
    } catch { throw new BadRequestException("La imagen esta danada, es animada o supera 20 megapixeles."); }
    const id = randomUUID();
    const key = `organizations/${organizationId}/files/${id}/original.jpg`;
    const storage = this.requireStorage();
    await storage.put(key, normalized.data, "image/jpeg");
    try {
      const result = await this.prisma.client.$transaction(async (tx) => {
        const saved = await tx.storedFile.create({ data: {
          id, originalName: sanitizeOriginalName(file.originalname), storageKey: key, bucket: storage.bucket,
          type: "IMAGE", mimeType: "image/jpeg", sizeBytes: BigInt(normalized.data.length),
          width: normalized.info.width, height: normalized.info.height, checksum: createHash("sha256").update(normalized.data).digest("hex"), createdById: user.id, organizationId,
          metadata: { sourceMimeType: file.mimetype, normalized: true, storagePathPolicy: "organizations/{organizationId}/files/{fileId}/original.jpg" },
        } });
        await tx.auditLog.create({ data: { userId: user.id, organizationId, action: "CREATE", entityType: "STORED_FILE", entityId: saved.id, metadata: { event: "FILE_UPLOADED", mimeType: saved.mimeType, sizeBytes: saved.sizeBytes.toString() } } });
        return saved;
      });
      return serializeStoredFile(result);
    } catch (error) {
      await storage.remove(key).catch(() => this.logger.error(`Orphaned upload requires cleanup: ${key}`));
      throw error;
    }
  }

  async download(id: string, user: CurrentUser) {
    const file = await this.findOwnedOrThrow(id, user);
    const content = await this.requireStorage().read(file.storageKey);
    await this.prisma.client.auditLog.create({ data: { userId: user.id, organizationId: user.organizationId, action: "DOWNLOAD", entityType: "STORED_FILE", entityId: id } });
    return { file, content };
  }

  async signedUrl(id: string, user: CurrentUser) {
    const file = await this.findOwnedOrThrow(id, user);
    const url = await this.requireStorage().sign(file.storageKey, signedUrlTtlSeconds);
    await this.prisma.client.auditLog.create({ data: { userId: user.id, organizationId: user.organizationId, action: "DOWNLOAD", entityType: "STORED_FILE", entityId: id, metadata: { event: "FILE_SIGNED_URL_CREATED", expiresIn: signedUrlTtlSeconds } } });
    return { url, expiresIn: signedUrlTtlSeconds };
  }

  async removeUnused(id: string, user: CurrentUser) {
    const file = await this.findOwnedOrThrow(id, user);
    if (file.type !== "IMAGE") throw new ConflictException("El PDF pertenece al historial.");
    const references = await this.prisma.client.generationInput.count({ where: { fileId: id } });
    if (references > 0) throw new ConflictException("Esta imagen ya forma parte de un documento.");
    try {
      await this.prisma.client.$transaction(async (tx) => {
        await tx.storedFile.delete({ where: { id } });
        await tx.auditLog.create({ data: { userId: user.id, organizationId: user.organizationId, action: "DELETE", entityType: "STORED_FILE", entityId: id, metadata: { event: "FILE_DELETED" } } });
      });
    } catch {
      throw new ConflictException("Esta imagen ya forma parte de un documento.");
    }
    await this.requireStorage().remove(file.storageKey).catch(() => this.logger.error(`Orphaned image requires cleanup: ${file.storageKey}`));
    return { deleted: true };
  }

  private requireStorage() {
    if (!this.storage) throw new Error("Storage is not configured");
    return this.storage;
  }

  async listOwned(user: CurrentUser, rawQuery: unknown = {}) {
    const query = parseFilesQuery(rawQuery);
    const where = {
      ...resourceScope(user),
      ...(query.type ? { type: query.type } : {}),
      ...(query.search ? { originalName: { contains: query.search, mode: "insensitive" as const } } : {}),
    };
    const orderBy = query.sortBy === "originalName" ? { originalName: query.sortOrder } : query.sortBy === "sizeBytes" ? { sizeBytes: query.sortOrder } : { createdAt: query.sortOrder };
    const [items, total] = await this.prisma.client.$transaction([
      this.prisma.client.storedFile.findMany({ where, orderBy, skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      this.prisma.client.storedFile.count({ where }),
    ]);
    return { items: items.map(serializeStoredFile), page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize) };
  }

  async findOwnedOrThrow(id: string, user: CurrentUser) {
    const file = await this.prisma.client.storedFile.findFirst({
      where: {
        id,
        ...resourceScope(user),
      },
    });

    if (!file) {
      throw new NotFoundException("File was not found");
    }

    return serializeStoredFile(file);
  }
}

function serializeStoredFile<T extends { sizeBytes: bigint }>(file: T): Omit<T, "sizeBytes"> & { sizeBytes: string } {
  return {
    ...file,
    sizeBytes: file.sizeBytes.toString(),
  };
}

export function parseFilesQuery(value: unknown): FilesQuery {
  const parsed = filesQuerySchema.safeParse(value);
  if (!parsed.success) throw new BadRequestException("Los filtros de archivos no son validos.");
  return parsed.data;
}

function validateUpload(file: { buffer: Buffer; originalname: string; mimetype: string } | undefined): asserts file is { buffer: Buffer; originalname: string; mimetype: typeof allowedInputMimeTypes[number] } {
  if (!file) throw new BadRequestException("Selecciona una imagen PNG, JPG o WebP de hasta 10 MB.");
  if (file.buffer.length > maxImageBytes) throw new BadRequestException("El archivo supera el tamano permitido de 10 MB.");
  if (!allowedInputMimeTypes.includes(file.mimetype as typeof allowedInputMimeTypes[number])) throw new BadRequestException("Este formato de archivo no esta permitido.");
  if (!allowedExtensions.has(extensionOf(file.originalname))) throw new BadRequestException("La extension del archivo no esta permitida.");
}

function sanitizeOriginalName(value: string) {
  return value.replace(/[^a-zA-Z0-9._ -]/g, "_").replace(/\s+/g, " ").trim().slice(0, 120) || "imagen.jpg";
}

function extensionOf(value: string) {
  const name = value.toLowerCase();
  const index = name.lastIndexOf(".");
  return index >= 0 ? name.slice(index) : "";
}

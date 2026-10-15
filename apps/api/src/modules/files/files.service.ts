import { BadRequestException, ConflictException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import sharp, { type OutputInfo } from "sharp";
import { z } from "zod";
import { StorageService } from "../storage/storage.service";

import { PrismaService } from "../../common/database/prisma.service";
import { resourceScope } from "../auth/access-scope";
import type { CurrentUser } from "../auth/types/current-user";

const maxImageBytes = 3 * 1024 * 1024;
const maxDocumentBytes = 3 * 1024 * 1024;
const signedUrlTtlSeconds = 300;
const allowedInputMimeTypes = ["image/jpeg", "image/png", "image/webp"] as const;
const allowedDocumentMimeTypes = ["application/pdf"] as const;
const allowedExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".pdf"]);
const filesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(12),
  search: z.string().trim().max(120).default(""),
  type: z.enum(["IMAGE", "PDF", "DOCUMENT"]).optional(),
  sortBy: z.enum(["createdAt", "originalName", "sizeBytes"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
}).strict();
const uploadContextSchema = z.object({ fileFieldId: z.string().uuid().optional() }).passthrough();

export type FilesQuery = z.infer<typeof filesQuerySchema>;

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService, @Inject(StorageService) private readonly storage?: StorageService) {}

  async upload(user: CurrentUser, file: { buffer: Buffer; originalname: string; mimetype: string } | undefined, rawContext: unknown = {}) {
    if (!file) throw new BadRequestException("Selecciona un archivo permitido de hasta 3 MB.");
    const upload = await prepareUpload(file);
    const context = parseUploadContext(rawContext);
    const fileField = context.fileFieldId ? await this.validateFileFieldUpload(user, context.fileFieldId, upload) : null;
    const id = randomUUID();
    const key = `company/files/${id}/original${upload.extension}`;
    const storage = this.requireStorage();
    await storage.put(key, upload.data, upload.mimeType);
    try {
      const result = await this.prisma.client.$transaction(async (tx) => {
        const saved = await tx.storedFile.create({ data: {
          id, originalName: sanitizeOriginalName(file.originalname), storageKey: key, bucket: storage.bucket,
          type: upload.type, mimeType: upload.mimeType, sizeBytes: BigInt(upload.data.length),
          width: upload.width, height: upload.height, checksum: createHash("sha256").update(upload.data).digest("hex"), createdById: user.id,
          fileFieldId: fileField?.id ?? null,
          metadata: { sourceMimeType: file.mimetype, normalized: upload.type === "IMAGE", storagePathPolicy: "company/files/{fileId}/original{extension}", ...(fileField ? { fileFieldKey: fileField.key, fileFieldLabel: fileField.label } : {}) },
        } });
        await tx.auditLog.create({ data: { userId: user.id, action: "CREATE", entityType: "STORED_FILE", entityId: saved.id, metadata: { event: "FILE_UPLOADED", mimeType: saved.mimeType, sizeBytes: saved.sizeBytes.toString() } } });
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
    await this.prisma.client.auditLog.create({ data: { userId: user.id, action: "DOWNLOAD", entityType: "STORED_FILE", entityId: id } });
    return { file, content };
  }

  async signedUrl(id: string, user: CurrentUser) {
    const file = await this.findOwnedOrThrow(id, user);
    const url = await this.requireStorage().sign(file.storageKey, signedUrlTtlSeconds);
    await this.prisma.client.auditLog.create({ data: { userId: user.id, action: "DOWNLOAD", entityType: "STORED_FILE", entityId: id, metadata: { event: "FILE_SIGNED_URL_CREATED", expiresIn: signedUrlTtlSeconds } } });
    return { url, expiresIn: signedUrlTtlSeconds };
  }

  async removeUnused(id: string, user: CurrentUser) {
    const file = await this.findOwnedOrThrow(id, user);
    const [inputReferences, attachmentReferences, outputReferences] = await this.prisma.client.$transaction([
      this.prisma.client.generationInput.count({ where: { fileId: id } }),
      this.prisma.client.generationAttachment.count({ where: { fileId: id } }),
      this.prisma.client.generation.count({ where: { outputFileId: id } }),
    ]);
    if (inputReferences + attachmentReferences + outputReferences > 0) throw new ConflictException("Este archivo ya forma parte de un documento o historial.");
    try {
      await this.prisma.client.$transaction(async (tx) => {
        await tx.storedFile.delete({ where: { id } });
        await tx.auditLog.create({ data: { userId: user.id, action: "DELETE", entityType: "STORED_FILE", entityId: id, metadata: { event: "FILE_DELETED" } } });
      });
    } catch {
      throw new ConflictException("Esta imagen ya forma parte de un documento.");
    }
    await this.requireStorage().remove(file.storageKey).catch(() => this.logger.error(`Orphaned file requires cleanup: ${file.storageKey}`));
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

  private async validateFileFieldUpload(user: CurrentUser, fileFieldId: string, upload: PreparedUpload) {
    const field = await this.prisma.client.fileField.findUnique({ where: { id: fileFieldId } });
    if (!field || !field.isActive) throw new BadRequestException("El campo de archivo no existe o esta inactivo.");
    if (!field.acceptedMimeTypes.includes(upload.mimeType)) throw new BadRequestException(`Este campo acepta unicamente: ${field.acceptedMimeTypes.join(", ")}.`);
    if (upload.data.length > field.maxFileSize) throw new BadRequestException(`El archivo supera el limite configurado para ${field.label}.`);
    return field;
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

function parseUploadContext(value: unknown) {
  const parsed = uploadContextSchema.safeParse(value);
  if (!parsed.success) throw new BadRequestException("Los datos de subida no son validos.");
  return parsed.data;
}

type PreparedUpload = {
  type: "IMAGE" | "PDF" | "DOCUMENT";
  data: Buffer;
  mimeType: string;
  extension: ".jpg" | ".pdf";
  width: number | null;
  height: number | null;
};

async function prepareUpload(file: { buffer: Buffer; originalname: string; mimetype: string } | undefined): Promise<PreparedUpload> {
  validateUpload(file);
  if (allowedInputMimeTypes.includes(file.mimetype as typeof allowedInputMimeTypes[number])) return prepareImageUpload(file as { buffer: Buffer; originalname: string; mimetype: typeof allowedInputMimeTypes[number] });
  return prepareDocumentUpload(file);
}

async function prepareImageUpload(file: { buffer: Buffer; originalname: string; mimetype: typeof allowedInputMimeTypes[number] }): Promise<PreparedUpload> {
  let normalized: { data: Buffer; info: OutputInfo };
  try {
    const image = sharp(file.buffer, { limitInputPixels: 20_000_000, failOn: "warning" });
    const metadata = await image.metadata();
    if (!["jpeg", "png", "webp"].includes(metadata.format ?? "") || (metadata.pages ?? 1) !== 1) throw new Error("Invalid image");
    normalized = await image.rotate().flatten({ background: "#ffffff" }).jpeg({ quality: 94 }).toBuffer({ resolveWithObject: true });
  } catch { throw new BadRequestException("La imagen esta danada, es animada o supera 20 megapixeles."); }
  if (normalized.data.length > maxImageBytes) throw new BadRequestException("La imagen normalizada supera 3 MB.");
  return { type: "IMAGE", data: normalized.data, mimeType: "image/jpeg", extension: ".jpg", width: normalized.info.width, height: normalized.info.height };
}

function prepareDocumentUpload(file: { buffer: Buffer; originalname: string; mimetype: string }): PreparedUpload {
  const extension = extensionOf(file.originalname);
  if (file.buffer.length > maxDocumentBytes) throw new BadRequestException("El archivo supera el tamano permitido de 3 MB.");
  if (!allowedDocumentMimeTypes.includes(file.mimetype as typeof allowedDocumentMimeTypes[number])) throw new BadRequestException("Este formato de archivo no esta permitido.");
  if (file.mimetype === "application/pdf") {
    if (extension !== ".pdf" || !hasPdfSignature(file.buffer)) throw new BadRequestException("El PDF no coincide con su extension o contenido.");
    return { type: "PDF", data: file.buffer, mimeType: "application/pdf", extension: ".pdf", width: null, height: null };
  }
  throw new BadRequestException("Solo se admiten documentos PDF.");
}

function validateUpload(file: { buffer: Buffer; originalname: string; mimetype: string } | undefined): asserts file is { buffer: Buffer; originalname: string; mimetype: string } {
  if (!file) throw new BadRequestException("Selecciona un archivo permitido de hasta 3 MB.");
  if (/\.docx?$/i.test(file.originalname) || file.mimetype === "application/msword" || file.mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") throw new BadRequestException("Word ya no esta permitido. Sube un PDF.");
  if (!allowedExtensions.has(extensionOf(file.originalname))) throw new BadRequestException("La extension del archivo no esta permitida.");
  const allowedMime = [...allowedInputMimeTypes, ...allowedDocumentMimeTypes].includes(file.mimetype as typeof allowedInputMimeTypes[number] | typeof allowedDocumentMimeTypes[number]);
  if (!allowedMime) throw new BadRequestException("Este formato de archivo no esta permitido.");
  if (file.buffer.length > maxImageBytes) throw new BadRequestException("El archivo supera el tamano permitido de 3 MB.");
}

function sanitizeOriginalName(value: string) {
  return value.replace(/[^a-zA-Z0-9._ -]/g, "_").replace(/\s+/g, " ").trim().slice(0, 120) || "imagen.jpg";
}

function extensionOf(value: string) {
  const name = value.toLowerCase();
  const index = name.lastIndexOf(".");
  return index >= 0 ? name.slice(index) : "";
}

function hasPdfSignature(buffer: Buffer) {
  return buffer.subarray(0, 5).toString("ascii") === "%PDF-";
}

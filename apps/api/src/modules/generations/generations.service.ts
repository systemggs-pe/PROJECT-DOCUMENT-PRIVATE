import { ConflictException, Inject, Injectable, Logger, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

import { PrismaService } from "../../common/database/prisma.service";
import { isSuperAdmin, requireTenant, resourceScope } from "../auth/tenant-context";
import type { CurrentUser } from "../auth/types/current-user";
import { StorageService } from "../storage/storage.service";
import { endOfDayExclusive, parseGenerationQuery, startOfDay, type GenerationQuery } from "./generation-query";

type DownloadableGeneration = {
  id: string;
  number: string;
  outputFile: { id: string; originalName: string; storageKey: string; bucket: string; type: "PDF"; mimeType: string };
};

@Injectable()
export class GenerationsService {
  private readonly logger = new Logger(GenerationsService.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService, @Inject(StorageService) private readonly storage?: StorageService) {}

  async listOwned(user: CurrentUser, rawQuery: unknown = {}) {
    const query = parseGenerationQuery(rawQuery);
    const where = buildWhere(user, query);
    const orderBy = query.sort === "number" ? { number: query.order } : { createdAt: query.order };
    const [items, total] = await this.prisma.client.$transaction([
      this.prisma.client.generation.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: {
          id: true, number: true, status: true, outputFileId: true, errorMessage: true, createdAt: true,
          template: { select: { id: true, name: true } },
          templateVersion: { select: { id: true, versionNumber: true } },
          outputFile: { select: { id: true, originalName: true, mimeType: true, sizeBytes: true } },
        },
      }),
      this.prisma.client.generation.count({ where }),
    ]);
    return {
      items: items.map(serializeGenerationListItem),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize),
    };
  }

  async findOwnedOrThrow(id: string, user: CurrentUser) {
    const generation = await this.prisma.client.generation.findFirst({
      where: {
        id,
        ...resourceScope(user),
      },
      include: {
        template: { select: { id: true, name: true } },
        templateVersion: { select: { id: true, versionNumber: true, paperSize: true, orientation: true, pageCount: true } },
        outputFile: { select: { id: true, originalName: true, mimeType: true, sizeBytes: true, createdAt: true } },
        inputs: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true, key: true, value: true, fileId: true,
            templateElement: { select: { id: true, name: true, key: true, type: true } },
            file: { select: { id: true, originalName: true, mimeType: true, sizeBytes: true, type: true } },
          },
        },
      },
    });

    if (!generation) {
      throw new NotFoundException("Generation was not found");
    }

    return { ...serializeGenerationDetail(generation), downloadUrl: generation.status === "COMPLETED" ? `/generations/${generation.id}/download` : null };
  }

  async removeOwned(id: string, user: CurrentUser) {
    const storage = this.requireStorage();
    const generation = await this.prisma.client.generation.findFirst({ where: { id, ...resourceScope(user) }, select: { id: true, number: true, status: true, outputFileId: true, outputFile: { select: { storageKey: true, bucket: true, type: true } } } });
    if (!generation) throw new NotFoundException("Generation was not found");
    if (generation.status === "PROCESSING" || generation.status === "PENDING") throw new ConflictException("No se puede eliminar una generacion en proceso.");
    const outputKey = generation.outputFile?.storageKey;
    let shouldRemoveOutput = false;

    await this.prisma.client.$transaction(async (tx) => {
      const otherReferences = generation.outputFileId ? await tx.generationInput.count({ where: { fileId: generation.outputFileId, generationId: { not: id } } }) : 0;
      shouldRemoveOutput = Boolean(generation.outputFileId && otherReferences === 0 && generation.outputFile?.type === "PDF" && generation.outputFile.bucket === storage.bucket && outputKey && isSafeOutputKey(outputKey, user));
      await tx.generationInput.deleteMany({ where: { generationId: id } });
      await tx.generation.delete({ where: { id } });
      if (generation.outputFileId && otherReferences === 0) await tx.storedFile.delete({ where: { id: generation.outputFileId } });
      await tx.auditLog.create({ data: { userId: user.id, organizationId: user.organizationId, action: "DELETE", entityType: "GENERATION", entityId: id, metadata: { event: "GENERATION_DELETED", number: generation.number } } });
    });

    if (shouldRemoveOutput && outputKey) await storage.remove(outputKey).catch(() => this.logger.error(`Generated file cleanup failed for deleted generation ${id}`));
    return { deleted: true, id };
  }

  async downloadOwned(id: string, user: CurrentUser) {
    const storage = this.requireStorage();
    const generation = await this.findDownloadableOwned(id, user, storage.bucket);

    const content = await storage.read(generation.outputFile.storageKey);
    await this.prisma.client.auditLog.create({ data: { userId: user.id, organizationId: user.organizationId, action: "DOWNLOAD", entityType: "GENERATION", entityId: id, metadata: { event: "GENERATION_DOWNLOADED" } } });
    return { generation, file: generation.outputFile, content };
  }

  async signedUrlOwned(id: string, user: CurrentUser) {
    const storage = this.requireStorage();
    const generation = await this.findDownloadableOwned(id, user, storage.bucket);
    const url = await storage.sign(generation.outputFile.storageKey);
    await this.prisma.client.auditLog.create({ data: { userId: user.id, organizationId: user.organizationId, action: "DOWNLOAD", entityType: "GENERATION", entityId: id, metadata: { event: "GENERATION_SIGNED_URL_CREATED", expiresIn: 300 } } });
    return { url, expiresIn: 300 };
  }

  private requireStorage() {
    if (!this.storage) throw new ServiceUnavailableException("El almacenamiento no esta configurado.");
    return this.storage;
  }

  private async findDownloadableOwned(id: string, user: CurrentUser, bucket: string): Promise<DownloadableGeneration> {
    const generation = await this.prisma.client.generation.findFirst({ where: { id, ...resourceScope(user), status: "COMPLETED" }, select: { id: true, number: true, outputFile: { select: { id: true, originalName: true, storageKey: true, bucket: true, type: true, mimeType: true } } } });
    if (!generation?.outputFile || generation.outputFile.type !== "PDF" || generation.outputFile.bucket !== bucket || !isSafeOutputKey(generation.outputFile.storageKey, user)) throw new NotFoundException("Generation was not found");
    return generation as DownloadableGeneration;
  }
}

function isSafeOutputKey(key: string, user: CurrentUser) {
  if (isSuperAdmin(user)) {
    return key.startsWith("organizations/") && key.includes("/generations/") && key.endsWith(".pdf") && !key.includes("..") && !key.includes("\\") && !key.includes("://");
  }
  const organizationId = requireTenant(user);
  return (key.startsWith(`organizations/${organizationId}/generations/`) || key.startsWith(`users/${user.id}/generated/`)) && key.endsWith(".pdf") && !key.includes("..") && !key.includes("\\") && !key.includes("://");
}

function buildWhere(user: CurrentUser, query: GenerationQuery): Prisma.GenerationWhereInput {
  const where: Prisma.GenerationWhereInput = resourceScope(user);
  if (query.status) where.status = query.status;
  if (query.templateId) where.templateId = query.templateId;
  if (query.templateVersionId) where.templateVersionId = query.templateVersionId;
  if (query.search) where.OR = [{ number: { contains: query.search, mode: "insensitive" } }, { template: { name: { contains: query.search, mode: "insensitive" } } }, { outputFile: { originalName: { contains: query.search, mode: "insensitive" } } }];
  if (query.from || query.to) where.createdAt = { ...(query.from ? { gte: startOfDay(query.from) } : {}), ...(query.to ? { lt: endOfDayExclusive(query.to) } : {}) };
  return where;
}

function serializeGenerationListItem<T extends { outputFile: { sizeBytes: bigint } | null }>(item: T) {
  return { ...item, outputFile: item.outputFile ? { ...item.outputFile, sizeBytes: item.outputFile.sizeBytes.toString() } : null };
}

function serializeGenerationDetail<T extends { outputFile: { sizeBytes: bigint } | null; inputs: Array<{ file: { sizeBytes: bigint } | null }> }>(generation: T) {
  return { ...generation, outputFile: generation.outputFile ? { ...generation.outputFile, sizeBytes: generation.outputFile.sizeBytes.toString() } : null, inputs: generation.inputs.map((input) => ({ ...input, file: input.file ? { ...input.file, sizeBytes: input.file.sizeBytes.toString() } : null })) };
}

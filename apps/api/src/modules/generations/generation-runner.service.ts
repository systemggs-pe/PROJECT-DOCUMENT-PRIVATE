import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { createHash, randomUUID } from "node:crypto";

import { PdfEngineError } from "@ggs/pdf-engine";
import { GenerationNumberService } from "../../common/database/generation-number.service";
import { PrismaService } from "../../common/database/prisma.service";
import { requireTenant, resourceScope } from "../auth/tenant-context";
import type { CurrentUser } from "../auth/types/current-user";
import { PdfService, type PdfTemplateVersionRecord } from "../pdf/pdf.service";
import { StorageService } from "../storage/storage.service";
import { parseGenerationInput, type GenerationInput } from "./generation-input";
import { GenerationsService } from "./generations.service";

type DecimalLike = number | { toNumber(): number };
type TemplateElementRecord = {
  id: string;
  type: string;
  name: string;
  key: string | null;
  page: number;
  x: DecimalLike;
  y: DecimalLike;
  width: DecimalLike;
  height: DecimalLike;
  rotation: DecimalLike;
  zIndex: number;
  required: boolean;
  properties: Prisma.JsonValue;
};

type PreparedGeneration = {
  input: GenerationInput;
  version: {
    id: string;
    templateId: string;
    versionNumber: number;
    paperSize: string;
    orientation: string;
    width: DecimalLike;
    height: DecimalLike;
    pageCount: number;
    elements: TemplateElementRecord[];
  };
  files: Array<{ id: string; storageKey: string; bucket: string; mimeType: string; originalName: string }>;
  elements: TemplateElementRecord[];
  snapshot: Prisma.InputJsonValue;
  fingerprint: string;
};

type Reservation =
  | { existingGenerationId: string; generation?: never }
  | { generation: { id: string; number: string }; existingGenerationId?: never };

@Injectable()
export class GenerationRunnerService {
  private readonly logger = new Logger(GenerationRunnerService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(GenerationNumberService) private readonly generationNumbers: GenerationNumberService,
    @Inject(StorageService) private readonly storage: StorageService,
    @Inject(PdfService) private readonly pdf: PdfService,
    @Inject(GenerationsService) private readonly generations: GenerationsService,
  ) {}

  async generate(user: CurrentUser, body: unknown) {
    const input = parseGenerationInput(body);
    const organizationId = requireTenant(user);
    const requestHash = buildRequestHash(input);
    const prepared = await this.prepare(user, input, requestHash, { allowExistingGeneration: true });

    if (prepared.existingGenerationId) {
      return this.generations.findOwnedOrThrow(prepared.existingGenerationId, user);
    }

    const startedAt = Date.now();
    const assets = await this.readAssets(prepared.files);
    let pdf: Buffer;
    try {
      pdf = await this.pdf.renderTemplateVersion(
        {
          ...prepared.version,
          elements: prepared.elements,
        } as unknown as PdfTemplateVersionRecord,
        assets,
      );
    } catch (error) {
      if (error instanceof PdfEngineError) {
        throw new BadRequestException("La plantilla no se puede renderizar.");
      }
      this.logger.error("PDF render failed before generation reservation");
      throw new ServiceUnavailableException("No se pudo generar el documento. Intenta nuevamente.");
    }

    const generationId = randomUUID();
    const outputKey = `organizations/${organizationId}/generations/${generationId}.pdf`;
    const reservation = await this.reserve(user, prepared, requestHash, generationId);
    if ("existingGenerationId" in reservation) return this.generations.findOwnedOrThrow(reservation.existingGenerationId, user);

    let uploadAttempted = false;
    let completed = false;
    try {
      uploadAttempted = true;
      await this.storage.put(outputKey, pdf, "application/pdf");
      await this.complete(user, prepared, reservation.generation, outputKey, pdf, startedAt);
      completed = true;
      return this.generations.findOwnedOrThrow(reservation.generation.id, user);
    } catch (error) {
      if (uploadAttempted && !completed) {
        await this.storage.remove(outputKey).catch(() => this.logger.error(`Generated file cleanup failed for ${reservation.generation.id}`));
      }
      if (!completed) await this.fail(user, reservation.generation.id, error);
      if (error instanceof BadRequestException || error instanceof ConflictException || error instanceof NotFoundException) throw error;
      throw new ServiceUnavailableException("No se pudo generar el documento. Intenta nuevamente.");
    }
  }

  async preview(user: CurrentUser, body: unknown) {
    const input = parseGenerationInput(body);
    const prepared = await this.prepare(user, input, buildRequestHash(input), { allowExistingGeneration: false });
    const assets = await this.readAssets(prepared.files);
    try {
      return await this.pdf.renderTemplateVersion(
        {
          ...prepared.version,
          elements: prepared.elements,
        } as unknown as PdfTemplateVersionRecord,
        assets,
      );
    } catch (error) {
      if (error instanceof PdfEngineError) {
        throw new BadRequestException("La plantilla no se puede renderizar.");
      }
      this.logger.error("PDF preview render failed");
      throw new ServiceUnavailableException("No se pudo previsualizar el documento. Intenta nuevamente.");
    }
  }

  private async prepare(user: CurrentUser, input: GenerationInput, requestHash: string, options: { allowExistingGeneration: boolean }): Promise<PreparedGeneration & { existingGenerationId?: string }> {
    const organizationId = requireTenant(user);
    return this.prisma.client.$transaction(async (tx) => {
      await lockUser(tx, user.id);
      if (options.allowExistingGeneration) {
        const existing = await tx.generation.findUnique({ where: { createdById_requestKey: { createdById: user.id, requestKey: input.requestKey } } });
        if (existing) {
          assertSameRequest(existing.requestHash, requestHash);
          return { existingGenerationId: existing.id } as PreparedGeneration & { existingGenerationId: string };
        }
      }

      const version = await findOwnedActiveVersion(tx, user, input);
      if (!version) throw new NotFoundException("La plantilla o version de plantilla no existe.");
      const elements = version.elements as unknown as TemplateElementRecord[];
      const imageSlots = elements.filter((element) => element.type === "IMAGE");
      if (imageSlots.some((element) => !element.key)) throw new BadRequestException("La plantilla tiene un campo de imagen invalido.");

      const slotByKey = new Map(imageSlots.map((element) => [element.key as string, element]));
      for (const item of input.inputs) {
        if (!slotByKey.has(item.key)) throw new BadRequestException({ message: `El campo ${item.key} no existe en la plantilla.`, error: "UNKNOWN_INPUT_SLOT" });
      }
      const missing = imageSlots.filter((slot) => slot.required && !input.inputs.some((item) => item.key === slot.key));
      if (missing.length > 0) throw new BadRequestException({ message: `Falta completar: ${missing.map((slot) => slot.name).join(", ")}.`, error: "MISSING_REQUIRED_INPUT" });

      const fileIds = input.inputs.map((item) => item.fileId);
      const files = await tx.storedFile.findMany({ where: { id: { in: fileIds }, ...resourceScope(user), type: "IMAGE", bucket: this.storage.bucket }, select: { id: true, storageKey: true, bucket: true, mimeType: true, originalName: true } });
      if (files.length !== fileIds.length || files.some((file) => !isSafeInputKey(file.storageKey, user.id, organizationId) || !isImageMime(file.mimeType))) throw new BadRequestException({ message: "Una imagen no existe o no te pertenece.", error: "INVALID_STORED_FILE" });

      const provided = new Map(input.inputs.map((item) => [item.key, item.fileId]));
      const resolvedElements = elements
        .filter((element) => element.type !== "IMAGE" || element.required || provided.has(element.key ?? ""))
        .map((element) => ({ ...element, ...(element.type === "IMAGE" && element.key && provided.has(element.key) ? { assetKey: provided.get(element.key) } : {}), properties: resolveProperties(element.properties, input.variables) }));
      const snapshot = {
        templateId: version.templateId,
        templateVersionId: version.id,
        versionNumber: version.versionNumber,
        paperSize: version.paperSize,
        orientation: version.orientation,
        width: toNumber(version.width),
        height: toNumber(version.height),
        pageCount: version.pageCount,
        elements: resolvedElements.map((element) => ({ ...element, x: toNumber(element.x), y: toNumber(element.y), width: toNumber(element.width), height: toNumber(element.height), rotation: toNumber(element.rotation) })),
      } as unknown as Prisma.InputJsonValue;

      return { input, version, files, elements: resolvedElements, snapshot, fingerprint: fingerprint(version) };
    });
  }

  private async readAssets(files: PreparedGeneration["files"]) {
    const contents = await Promise.all(files.map(async (file) => ({ file, data: await this.storage.read(file.storageKey) })));
    return contents.map(({ file, data }) => ({ key: file.id, contentType: file.mimeType, fileName: file.originalName, data }));
  }

  private async reserve(user: CurrentUser, prepared: PreparedGeneration, requestHash: string, generationId: string): Promise<Reservation> {
    const organizationId = requireTenant(user);
    return this.prisma.client.$transaction(async (tx) => {
      await lockUser(tx, user.id);
      const existing = await tx.generation.findUnique({ where: { createdById_requestKey: { createdById: user.id, requestKey: prepared.input.requestKey } } });
      if (existing) {
        assertSameRequest(existing.requestHash, requestHash);
        return { existingGenerationId: existing.id };
      }
      const current = await findOwnedActiveVersion(tx, user, prepared.input);
      if (!current || fingerprint(current) !== prepared.fingerprint) throw new ConflictException("La version de plantilla cambio. Recarga e intenta nuevamente.");
      const allocated = await this.generationNumbers.next("default", tx);
      const generation = await tx.generation.create({
        data: {
          id: generationId,
          sequenceNumber: allocated.sequenceNumber,
          number: allocated.number,
          templateId: prepared.version.templateId,
          templateVersionId: prepared.version.id,
          createdById: user.id,
          organizationId,
          status: "PROCESSING",
          startedAt: new Date(),
          requestKey: prepared.input.requestKey,
          requestHash,
          snapshot: prepared.snapshot,
          inputs: { create: [
            ...prepared.input.inputs.map((item) => ({ key: item.key, fileId: item.fileId, templateElementId: prepared.version.elements.find((element) => element.key === item.key)?.id as string })),
            ...Object.entries(prepared.input.variables).filter(([key]) => prepared.version.elements.some((element) => element.type === "TEXT" && variableIsUsed(element.properties, key))).map(([key, value]) => ({ key, value, templateElementId: prepared.version.elements.find((element) => element.type === "TEXT" && variableIsUsed(element.properties, key))?.id as string })),
          ] },
        },
      });
      return { generation };
    });
  }

  private async complete(user: CurrentUser, prepared: PreparedGeneration, generation: { id: string; number: string }, outputKey: string, pdf: Buffer, startedAt: number) {
    const outputFileId = randomUUID();
    const organizationId = requireTenant(user);
    await this.prisma.client.$transaction(async (tx) => {
      await tx.storedFile.create({ data: { id: outputFileId, originalName: `${generation.number}.pdf`, storageKey: outputKey, bucket: this.storage.bucket, type: "PDF", mimeType: "application/pdf", sizeBytes: BigInt(pdf.length), checksum: createHash("sha256").update(pdf).digest("hex"), createdById: user.id, organizationId, metadata: { generatedBy: "pdf-engine", templateVersionId: prepared.version.id } } });
      await tx.generation.update({ where: { id: generation.id }, data: { status: "COMPLETED", outputFileId, completedAt: new Date() } });
      await tx.auditLog.create({ data: { userId: user.id, organizationId, action: "GENERATE", entityType: "GENERATION", entityId: generation.id, metadata: { event: "GENERATION_CREATED", number: generation.number, durationMs: Date.now() - startedAt, assetCount: prepared.input.inputs.length, outputSizeBytes: pdf.length } } });
    });
  }

  private async fail(user: CurrentUser, generationId: string, cause: unknown) {
    const message = cause instanceof PdfEngineError ? "La plantilla no se puede renderizar." : "No se pudo guardar el documento.";
    try {
      await this.prisma.client.$transaction(async (tx) => {
        await tx.generation.update({ where: { id: generationId }, data: { status: "FAILED", errorMessage: message } });
        await tx.auditLog.create({ data: { userId: user.id, organizationId: user.organizationId, action: "GENERATE", entityType: "GENERATION", entityId: generationId, metadata: { event: "GENERATION_FAILED" } } });
      });
    } catch { this.logger.error(`Failed generation status update for ${generationId}`); }
  }
}

async function findOwnedActiveVersion(tx: Prisma.TransactionClient, user: CurrentUser, input: GenerationInput) {
  return tx.templateVersion.findFirst({
    where: input.templateVersionId ? { id: input.templateVersionId, ...(input.templateId ? { templateId: input.templateId } : {}), template: { ...resourceScope(user), status: "ACTIVE" } } : { templateId: input.templateId ?? "", isActive: true, template: { ...resourceScope(user), status: "ACTIVE" } },
    include: { elements: { orderBy: [{ zIndex: "asc" }, { createdAt: "asc" }] }, template: { select: { id: true, name: true } } },
  });
}

async function lockUser(tx: Prisma.TransactionClient, userId: string) {
  await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
}

function assertSameRequest(existingHash: string | null, requestHash: string) {
  if (existingHash !== requestHash) throw new ConflictException("La clave de solicitud ya fue utilizada con otros datos.");
}

function buildRequestHash(input: GenerationInput) {
  return createHash("sha256").update(JSON.stringify({ templateId: input.templateId ?? null, templateVersionId: input.templateVersionId ?? null, inputs: [...input.inputs].sort((a, b) => a.key.localeCompare(b.key)), variables: Object.fromEntries(Object.entries(input.variables).sort(([a], [b]) => a.localeCompare(b))) })).digest("hex");
}

function fingerprint(version: { id: string; versionNumber: number; paperSize: string; orientation: string; width: DecimalLike; height: DecimalLike; pageCount: number; elements: unknown[] }) {
  return createHash("sha256").update(JSON.stringify({ id: version.id, versionNumber: version.versionNumber, paperSize: version.paperSize, orientation: version.orientation, width: toNumber(version.width), height: toNumber(version.height), pageCount: version.pageCount, elements: version.elements })).digest("hex");
}

function resolveProperties(properties: Prisma.JsonValue, variables: Record<string, string>): Prisma.JsonValue {
  if (!isRecord(properties)) return properties;
  const resolved = { ...properties };
  if (typeof resolved.text === "string") resolved.text = resolved.text.replace(/{{\s*([a-z][a-z0-9_]*)\s*}}/gi, (_match, key: string) => variables[key.toLowerCase()] ?? variables[key] ?? "");
  return resolved as Prisma.JsonValue;
}

function variableIsUsed(properties: Prisma.JsonValue, key: string) {
  return isRecord(properties) && typeof properties.text === "string" && new RegExp(`{{\\s*${escapeRegExp(key)}\\s*}}`, "i").test(properties.text);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isRecord(value: Prisma.JsonValue): value is Prisma.JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toNumber(value: DecimalLike) {
  return typeof value === "number" ? value : value.toNumber();
}

function isImageMime(value: string) {
  return value === "image/jpeg" || value === "image/png" || value === "image/webp";
}

function isSafeInputKey(key: string, userId: string, organizationId: string) {
  return (key.startsWith(`organizations/${organizationId}/files/`) || key.startsWith(`users/${userId}/files/`)) && key.endsWith("/original.jpg") && !key.includes("..") && !key.includes("\\") && !key.includes("://");
}

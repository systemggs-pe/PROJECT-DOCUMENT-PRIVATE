import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { z } from "zod";

import { PrismaService } from "../../common/database/prisma.service";
import { resourceScope } from "../auth/access-scope";
import type { CurrentUser } from "../auth/types/current-user";
import {
  parseTemplateInput,
  parseTemplateMetadata,
  type TemplateInput,
  type TemplateMetadataInput,
  type TemplateVersionInput,
} from "./template-input";

const templateListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(120).default(""),
  status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]).optional(),
  sortBy: z.enum(["createdAt", "updatedAt", "name"]).default("updatedAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
}).strict();

export type TemplateListQuery = z.infer<typeof templateListQuerySchema>;

const emptyVersion: TemplateVersionInput = {
  paperSize: "A4", orientation: "PORTRAIT", width: 595.28, height: 841.89,
  marginTop: 0, marginRight: 0, marginBottom: 0, marginLeft: 0, pageCount: 1, elements: [],
};

@Injectable()
export class TemplatesService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async create(user: CurrentUser, body: unknown) {
    const versionInput = this.hasVersionPayload(body) ? parseTemplateInput(body) : null;
    const metadata: TemplateMetadataInput = versionInput ? { name: versionInput.name, description: versionInput.description } : parseTemplateMetadata(body);
    const version = versionInput ?? emptyVersion;
    const templateId = randomUUID();

    await this.prisma.client.$transaction(async (tx) => {
      await tx.template.create({ data: { id: templateId, name: metadata.name, description: metadata.description, status: "ACTIVE", createdById: user.id } });
      await tx.templateVersion.create({ data: versionData(templateId, version, true) });
      await tx.auditLog.create({ data: { userId: user.id, action: "CREATE", entityType: "TEMPLATE", entityId: templateId, metadata: { event: "TEMPLATE_CREATED", versionNumber: 1 } } });
    });
    return this.findOwnedOrThrow(templateId, user);
  }

  async save(user: CurrentUser, body: unknown, id?: string) {
    const input = parseTemplateInput(body);
    const templateId = id ?? randomUUID();
    await this.prisma.client.$transaction(async (tx) => {
      if (id) {
        await this.lockOwnedTemplate(tx, id, user);
        const current = await tx.template.findFirst({ where: { id, ...resourceScope(user) }, include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } } });
        if (!current) throw new NotFoundException("Plantilla no encontrada.");
        if (input.expectedVersion !== current.versions[0]?.versionNumber) throw new ConflictException("La plantilla cambio. Recarga antes de guardar.");
      } else {
        await tx.template.create({ data: { id: templateId, name: input.name, description: input.description, createdById: user.id } });
      }
      const latest = await tx.templateVersion.aggregate({ where: { templateId }, _max: { versionNumber: true } });
      await tx.templateVersion.updateMany({ where: { templateId, isActive: true }, data: { isActive: false } });
      await tx.templateVersion.create({ data: { ...versionData(templateId, input, true), versionNumber: (latest._max.versionNumber ?? 0) + 1 } });
      await tx.template.update({ where: { id: templateId }, data: { name: input.name, description: input.description, status: "ACTIVE" } });
      await tx.auditLog.create({ data: { userId: user.id, action: id ? "UPDATE" : "CREATE", entityType: id ? "TEMPLATE_VERSION" : "TEMPLATE", entityId: templateId, metadata: { event: id ? "TEMPLATE_VERSION_CREATED" : "TEMPLATE_CREATED", versionNumber: (latest._max.versionNumber ?? 0) + 1 } } });
    });
    return this.findOwnedOrThrow(templateId, user);
  }

  async updateMetadata(id: string, user: CurrentUser, body: unknown) {
    const input = parseTemplateMetadata(body);
    await this.prisma.client.$transaction(async (tx) => {
      await this.lockOwnedTemplate(tx, id, user);
      await tx.template.update({ where: { id }, data: input });
      await tx.auditLog.create({ data: { userId: user.id, action: "UPDATE", entityType: "TEMPLATE", entityId: id, metadata: { event: "TEMPLATE_UPDATED" } } });
    });
    return this.findOwnedOrThrow(id, user);
  }

  async archive(id: string, user: CurrentUser) {
    await this.changeStatus(id, user, "ARCHIVED", "TEMPLATE_ARCHIVED");
    return this.findOwnedOrThrow(id, user);
  }

  async restore(id: string, user: CurrentUser) {
    await this.changeStatus(id, user, "ACTIVE", "TEMPLATE_RESTORED");
    return this.findOwnedOrThrow(id, user);
  }

  async listOwned(user: CurrentUser, rawQuery: unknown = {}) {
    const query = parseTemplateListQuery(rawQuery);
    const where = {
      ...resourceScope(user),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search ? { OR: [{ name: { contains: query.search, mode: "insensitive" as const } }, { description: { contains: query.search, mode: "insensitive" as const } }] } : {}),
    };
    const orderBy = query.sortBy === "name" ? { name: query.sortOrder } : query.sortBy === "createdAt" ? { createdAt: query.sortOrder } : { updatedAt: query.sortOrder };
    const [items, total] = await this.prisma.client.$transaction([
      this.prisma.client.template.findMany({ where, orderBy, skip: (query.page - 1) * query.pageSize, take: query.pageSize, include: { versions: { orderBy: { versionNumber: "desc" }, include: { elements: { orderBy: [{ zIndex: "asc" }, { createdAt: "asc" }] } } } } }),
      this.prisma.client.template.count({ where }),
    ]);
    return { items, page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize) };
  }

  async findOwnedOrThrow(id: string, user: CurrentUser) {
    const template = await this.prisma.client.template.findFirst({ where: { id, ...resourceScope(user) }, include: { versions: { include: { elements: { orderBy: [{ zIndex: "asc" }, { createdAt: "asc" }] } }, orderBy: { versionNumber: "desc" } } } });
    if (!template) throw new NotFoundException("Template was not found");
    return { ...template, activeVersion: template.versions.find((version) => version.isActive) ?? null };
  }

  private async changeStatus(id: string, user: CurrentUser, status: "ACTIVE" | "ARCHIVED", event: string) {
    await this.prisma.client.$transaction(async (tx) => {
      await this.lockOwnedTemplate(tx, id, user);
      await tx.template.update({ where: { id }, data: { status } });
      await tx.auditLog.create({ data: { userId: user.id, action: "UPDATE", entityType: "TEMPLATE", entityId: id, metadata: { event, status } } });
    });
  }

  private async lockOwnedTemplate(tx: Prisma.TransactionClient, id: string, user: CurrentUser) {
    const exists = await tx.template.findFirst({ where: { id, ...resourceScope(user) }, select: { id: true } });
    if (!exists) throw new NotFoundException("Plantilla no encontrada.");
  }

  private hasVersionPayload(body: unknown): body is Record<string, unknown> {
    return typeof body === "object" && body !== null && "paperSize" in body;
  }
}

export function parseTemplateListQuery(value: unknown): TemplateListQuery {
  const parsed = templateListQuerySchema.safeParse(value);
  if (!parsed.success) throw new BadRequestException("Los filtros de plantillas no son validos.");
  return parsed.data;
}

export function versionData(templateId: string, input: TemplateVersionInput | TemplateInput, isActive: boolean) {
  return {
    templateId, versionNumber: 1, isActive, paperSize: input.paperSize, orientation: input.orientation, width: input.width, height: input.height,
    pageCount: input.pageCount, marginTop: input.marginTop, marginRight: input.marginRight, marginBottom: input.marginBottom, marginLeft: input.marginLeft,
    elements: { create: input.elements.map((item) => ({ type: item.type, fileFieldId: item.fileFieldId ?? null, name: item.name, key: item.key, page: item.page, x: item.x, y: item.y, width: item.width, height: item.height, rotation: item.rotation, zIndex: item.zIndex, required: item.required, properties: item.properties })) },
  };
}

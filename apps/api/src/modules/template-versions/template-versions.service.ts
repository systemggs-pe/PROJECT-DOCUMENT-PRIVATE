import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

import { PrismaService } from "../../common/database/prisma.service";
import { resourceScope } from "../auth/tenant-context";
import type { CurrentUser } from "../auth/types/current-user";
import { parseTemplateVersionInput, type TemplateVersionInput } from "../templates/template-input";
import { versionData } from "../templates/templates.service";

@Injectable()
export class TemplateVersionsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async listOwned(templateId: string, user: CurrentUser) {
    await this.assertTemplate(templateId, user);
    return this.prisma.client.templateVersion.findMany({
      where: { templateId }, orderBy: { versionNumber: "desc" },
      select: { id: true, templateId: true, versionNumber: true, paperSize: true, orientation: true, width: true, height: true, marginTop: true, marginRight: true, marginBottom: true, marginLeft: true, pageCount: true, isActive: true, createdAt: true },
    });
  }

  async findOwned(templateId: string, versionId: string, user: CurrentUser) {
    await this.assertTemplate(templateId, user);
    const version = await this.prisma.client.templateVersion.findFirst({
      where: { id: versionId, templateId },
      include: { elements: { orderBy: [{ zIndex: "asc" }, { createdAt: "asc" }] } },
    });
    if (!version) throw new NotFoundException("Version de plantilla no encontrada.");
    return version;
  }

  async update(templateId: string, versionId: string, user: CurrentUser, body: unknown) {
    const input = parseTemplateVersionInput(body);
    await this.prisma.client.$transaction(async (tx) => {
      await this.lockTemplate(tx, templateId, user);
      const version = await tx.templateVersion.findFirst({ where: { id: versionId, templateId }, select: { id: true, versionNumber: true } });
      if (!version) throw new NotFoundException("Version de plantilla no encontrada.");
      const generations = await tx.generation.count({ where: { templateVersionId: versionId } });
      if (generations > 0) throw new ConflictException("Esta version ya tiene documentos generados. Duplicala para editar un borrador.");

      await tx.templateVersion.update({
        where: { id: versionId },
        data: versionPatch(input),
      });
      await tx.templateElement.deleteMany({ where: { templateVersionId: versionId } });
      if (input.elements.length) {
        await tx.templateElement.createMany({
          data: input.elements.map((element) => ({
            id: element.id, templateVersionId: versionId, type: element.type, name: element.name, key: element.key,
            page: element.page, x: element.x, y: element.y, width: element.width, height: element.height,
            rotation: element.rotation, zIndex: element.zIndex, required: element.required,
            properties: element.properties as Prisma.InputJsonValue,
          })),
        });
      }
      await tx.template.update({ where: { id: templateId }, data: { updatedAt: new Date() } });
      await tx.auditLog.create({
        data: {
          userId: user.id, organizationId: user.organizationId, action: "UPDATE", entityType: "TEMPLATE_VERSION", entityId: versionId,
          metadata: { event: "TEMPLATE_VERSION_SAVED", versionNumber: version.versionNumber, elementCount: input.elements.length },
        },
      });
    });
    return this.findOwned(templateId, versionId, user);
  }

  async create(templateId: string, user: CurrentUser, body: unknown) {
    const input = parseTemplateVersionInput(body);
    const version = await this.prisma.client.$transaction(async (tx) => {
      const template = await this.lockTemplate(tx, templateId, user);
      if (template.status === "ARCHIVED") throw new ConflictException("Restaura la plantilla antes de crear una version.");
      const latest = await tx.templateVersion.aggregate({ where: { templateId }, _max: { versionNumber: true } });
      const created = await tx.templateVersion.create({ data: { ...versionData(templateId, input, false), versionNumber: (latest._max.versionNumber ?? 0) + 1 } });
      await tx.auditLog.create({ data: { userId: user.id, organizationId: user.organizationId, action: "CREATE", entityType: "TEMPLATE_VERSION", entityId: created.id, metadata: { event: "TEMPLATE_VERSION_CREATED", versionNumber: created.versionNumber } } });
      return created;
    });
    return this.findOwned(templateId, version.id, user);
  }

  async duplicate(templateId: string, versionId: string, user: CurrentUser) {
    const version = await this.prisma.client.$transaction(async (tx) => {
      const template = await this.lockTemplate(tx, templateId, user);
      if (template.status === "ARCHIVED") throw new ConflictException("Restaura la plantilla antes de duplicar una version.");
      const source = await tx.templateVersion.findFirst({ where: { id: versionId, templateId }, include: { elements: true } });
      if (!source) throw new NotFoundException("Version de plantilla no encontrada.");
      const latest = await tx.templateVersion.aggregate({ where: { templateId }, _max: { versionNumber: true } });
      const created = await tx.templateVersion.create({
        data: {
          templateId, versionNumber: (latest._max.versionNumber ?? 0) + 1, isActive: false, paperSize: source.paperSize, orientation: source.orientation,
          width: source.width, height: source.height, marginTop: source.marginTop, marginRight: source.marginRight, marginBottom: source.marginBottom, marginLeft: source.marginLeft, pageCount: source.pageCount,
          elements: { create: source.elements.map((element) => ({ type: element.type, name: element.name, key: element.key, page: element.page, x: element.x, y: element.y, width: element.width, height: element.height, rotation: element.rotation, zIndex: element.zIndex, required: element.required, properties: element.properties as Prisma.InputJsonValue })) },
        },
      });
      await tx.auditLog.create({ data: { userId: user.id, organizationId: user.organizationId, action: "CREATE", entityType: "TEMPLATE_VERSION", entityId: created.id, metadata: { event: "TEMPLATE_VERSION_DUPLICATED", sourceVersionId: versionId, versionNumber: created.versionNumber } } });
      return created;
    });
    return this.findOwned(templateId, version.id, user);
  }

  async activate(templateId: string, versionId: string, user: CurrentUser) {
    await this.prisma.client.$transaction(async (tx) => {
      const template = await this.lockTemplate(tx, templateId, user);
      if (template.status === "ARCHIVED") throw new ConflictException("Restaura la plantilla antes de activar una version.");
      const version = await tx.templateVersion.findFirst({ where: { id: versionId, templateId }, select: { id: true, versionNumber: true } });
      if (!version) throw new NotFoundException("Version de plantilla no encontrada.");
      await tx.templateVersion.updateMany({ where: { templateId, isActive: true }, data: { isActive: false } });
      await tx.templateVersion.update({ where: { id: versionId }, data: { isActive: true } });
      await tx.auditLog.create({ data: { userId: user.id, organizationId: user.organizationId, action: "UPDATE", entityType: "TEMPLATE_VERSION", entityId: versionId, metadata: { event: "TEMPLATE_VERSION_ACTIVATED", versionNumber: version.versionNumber } } });
    });
    return this.findOwned(templateId, versionId, user);
  }

  private async assertTemplate(templateId: string, user: CurrentUser) {
    const template = await this.prisma.client.template.findFirst({ where: { id: templateId, ...resourceScope(user) }, select: { id: true, status: true } });
    if (!template) throw new NotFoundException("Plantilla no encontrada.");
    return template;
  }

  private async lockTemplate(tx: Prisma.TransactionClient, templateId: string, user: CurrentUser) {
    const template = await tx.template.findFirst({ where: { id: templateId, ...resourceScope(user) }, select: { id: true, status: true } });
    if (!template) throw new NotFoundException("Plantilla no encontrada.");
    return template;
  }
}

function versionPatch(input: TemplateVersionInput) {
  return {
    paperSize: input.paperSize, orientation: input.orientation, width: input.width, height: input.height,
    pageCount: input.pageCount, marginTop: input.marginTop, marginRight: input.marginRight,
    marginBottom: input.marginBottom, marginLeft: input.marginLeft,
  };
}

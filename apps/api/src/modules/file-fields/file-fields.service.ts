import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

import { PrismaService } from "../../common/database/prisma.service";
import type { CurrentUser } from "../auth/types/current-user";
import { parseFileFieldCreate, parseFileFieldQuery, parseFileFieldUpdate } from "./dto";

@Injectable()
export class FileFieldsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(rawQuery: unknown = {}) {
    const query = parseFileFieldQuery(rawQuery);
    const where: Prisma.FileFieldWhereInput = {
      ...(query.source ? { source: query.source } : {}),
      ...(query.status ? { isActive: query.status === "ACTIVE" } : {}),
      ...(query.search ? { OR: [
        { label: { contains: query.search, mode: "insensitive" } },
        { key: { contains: query.search, mode: "insensitive" } },
        { description: { contains: query.search, mode: "insensitive" } },
      ] } : {}),
      ...(query.type === "IMAGE" ? { acceptedMimeTypes: { hasSome: ["image/jpeg", "image/png", "image/webp"] } } : {}),
      ...(query.type === "PDF" ? { acceptedMimeTypes: { has: "application/pdf" } } : {}),
      ...(query.type === "DOCUMENT" ? { acceptedMimeTypes: { hasSome: ["application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"] } } : {}),
    };
    const items = await this.prisma.client.fileField.findMany({ where, orderBy: [{ sortOrder: "asc" }, { label: "asc" }] });
    return { items };
  }

  async create(actor: CurrentUser, body: unknown) {
    const input = parseFileFieldCreate(body);
    const key = input.key ?? slugify(input.label);
    const created = await this.prisma.client.$transaction(async (tx) => {
      const uniqueKey = await ensureUniqueKey(tx, key);
      const field = await tx.fileField.create({
        data: {
          key: uniqueKey,
          label: input.label,
          description: input.description ?? null,
          required: input.required,
          acceptedMimeTypes: input.acceptedMimeTypes,
          maxFiles: input.maxFiles,
          maxFileSize: input.maxFileSize,
          source: "CUSTOM",
          isActive: input.isActive,
          sortOrder: input.sortOrder,
        },
      });
      await tx.auditLog.create({ data: { userId: actor.id, action: "CREATE", entityType: "FILE_FIELD", entityId: field.id, metadata: { event: "FILE_FIELD_CREATED", key: field.key } } });
      return field;
    });
    return created;
  }

  async update(actor: CurrentUser, id: string, body: unknown) {
    const input = parseFileFieldUpdate(body);
    const updated = await this.prisma.client.$transaction(async (tx) => {
      const current = await tx.fileField.findUnique({ where: { id } });
      if (!current) throw new NotFoundException("Campo de archivo no encontrado.");
      if (current.source === "SYSTEM" && input.key && input.key !== current.key) throw new ConflictException("No puedes cambiar la clave de un campo SYSTEM.");
      const nextKey = input.key && input.key !== current.key ? await ensureUniqueKey(tx, input.key) : undefined;
      const field = await tx.fileField.update({
        where: { id },
        data: {
          ...(nextKey ? { key: nextKey } : {}),
          ...(input.label !== undefined ? { label: input.label } : {}),
          ...(input.description !== undefined ? { description: input.description ?? null } : {}),
          ...(input.required !== undefined ? { required: input.required } : {}),
          ...(input.acceptedMimeTypes !== undefined ? { acceptedMimeTypes: input.acceptedMimeTypes } : {}),
          ...(input.maxFiles !== undefined ? { maxFiles: input.maxFiles } : {}),
          ...(input.maxFileSize !== undefined ? { maxFileSize: input.maxFileSize } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
          ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
        },
      });
      await tx.auditLog.create({ data: { userId: actor.id, action: "UPDATE", entityType: "FILE_FIELD", entityId: id, metadata: { event: input.isActive === false ? "FILE_FIELD_DEACTIVATED" : input.isActive === true ? "FILE_FIELD_ACTIVATED" : "FILE_FIELD_UPDATED", fields: Object.keys(input) } } });
      return field;
    });
    return updated;
  }

  async remove(actor: CurrentUser, id: string) {
    return this.prisma.client.$transaction(async (tx) => {
      const current = await tx.fileField.findUnique({ where: { id } });
      if (!current) throw new NotFoundException("Campo de archivo no encontrado.");
      if (current.source === "SYSTEM") throw new ConflictException("Los campos SYSTEM no se eliminan; puedes desactivarlos si corresponde.");
      const [templateUses, fileUses] = await Promise.all([
        tx.templateElement.count({ where: { fileFieldId: id } }),
        tx.storedFile.count({ where: { fileFieldId: id } }),
      ]);
      if (templateUses + fileUses > 0) {
        const field = await tx.fileField.update({ where: { id }, data: { isActive: false } });
        await tx.auditLog.create({ data: { userId: actor.id, action: "UPDATE", entityType: "FILE_FIELD", entityId: id, metadata: { event: "FILE_FIELD_DEACTIVATED", reason: "IN_USE" } } });
        return { deleted: false, deactivated: true, field };
      }
      await tx.fileField.delete({ where: { id } });
      await tx.auditLog.create({ data: { userId: actor.id, action: "DELETE", entityType: "FILE_FIELD", entityId: id, metadata: { event: "FILE_FIELD_DELETED" } } });
      return { deleted: true, deactivated: false };
    });
  }
}

function slugify(value: string) {
  const key = value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 55);
  return /^[a-z]/.test(key) ? key : `campo_${key || "archivo"}`;
}

async function ensureUniqueKey(tx: Prisma.TransactionClient, key: string) {
  if (!/^[a-z][a-z0-9_]{0,59}$/.test(key)) throw new BadRequestException("La clave del campo no es valida.");
  let candidate = key.slice(0, 60);
  let suffix = 2;
  while (await tx.fileField.findUnique({ where: { key: candidate }, select: { id: true } })) {
    const tail = `_${suffix++}`;
    candidate = `${key.slice(0, 60 - tail.length)}${tail}`;
  }
  return candidate;
}

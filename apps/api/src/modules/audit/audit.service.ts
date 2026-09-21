import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { z } from "zod";

import { PrismaService } from "../../common/database/prisma.service";
import type { CurrentUser } from "../auth/types/current-user";

const auditQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
  entityType: z.enum(["USER", "ROLE", "PERMISSION", "COMPANY_SETTINGS", "OWNER_PROFILE", "TEMPLATE", "TEMPLATE_VERSION", "TEMPLATE_ELEMENT", "GENERATION", "GENERATION_INPUT", "STORED_FILE"]).optional(),
  action: z.enum(["CREATE", "UPDATE", "DELETE", "DOWNLOAD", "GENERATE", "LOGIN", "ASSIGN", "REMOVE"]).optional(),
}).strict();

@Injectable()
export class AuditService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(user: CurrentUser, rawQuery: unknown = {}) {
    const parsed = auditQuerySchema.safeParse(rawQuery);
    if (!parsed.success) throw new BadRequestException("Los filtros de auditoria no son validos.");
    const query = parsed.data;
    const where: Prisma.AuditLogWhereInput = {
      ...(query.action ? { action: query.action } : {}),
      ...(query.entityType ? { entityType: query.entityType } : {}),
    };
    const [items, total] = await this.prisma.client.$transaction([
      this.prisma.client.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: { user: { select: { id: true, email: true, name: true } } },
      }),
      this.prisma.client.auditLog.count({ where }),
    ]);
    return { items, page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize) };
  }
}

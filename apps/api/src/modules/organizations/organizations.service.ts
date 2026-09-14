import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma as PrismaNamespace, type Prisma } from "@prisma/client";

import { PrismaService } from "../../common/database/prisma.service";
import { isSuperAdmin } from "../auth/tenant-context";
import type { CurrentUser } from "../auth/types/current-user";
import { parseOrganizationInput, parseOrganizationQuery, parseOrganizationUpdate } from "./dto";

@Injectable()
export class OrganizationsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(actor: CurrentUser, rawQuery: unknown = {}) {
    if (!isSuperAdmin(actor)) throw new ForbiddenException("Solo SUPERADMIN puede listar organizaciones.");
    const query = parseOrganizationQuery(rawQuery);
    const where: Prisma.OrganizationWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.search ? { OR: [{ name: { contains: query.search, mode: "insensitive" } }, { slug: { contains: query.search, mode: "insensitive" } }, { legalName: { contains: query.search, mode: "insensitive" } }] } : {}),
    };
    const orderBy = query.sortBy === "name" ? { name: query.sortOrder } : query.sortBy === "slug" ? { slug: query.sortOrder } : { createdAt: query.sortOrder };
    const [items, total] = await this.prisma.client.$transaction([
      this.prisma.client.organization.findMany({ where, orderBy, skip: (query.page - 1) * query.pageSize, take: query.pageSize, include: organizationCounts }),
      this.prisma.client.organization.count({ where }),
    ]);
    return { items: items.map(serializeOrganization), page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize) };
  }

  async create(actor: CurrentUser, body: unknown) {
    if (!isSuperAdmin(actor)) throw new ForbiddenException("Solo SUPERADMIN puede crear organizaciones.");
    const input = parseOrganizationInput(body);
    const organization = await this.prisma.client.$transaction(async (tx) => {
      try {
        const created = await tx.organization.create({ data: toOrganizationCreate(input) });
        await tx.auditLog.create({ data: { userId: actor.id, organizationId: created.id, action: "CREATE", entityType: "ORGANIZATION", entityId: created.id, metadata: { event: "ORGANIZATION_CREATED", slug: created.slug } } });
        return created;
      } catch (error) {
        if (error instanceof PrismaNamespace.PrismaClientKnownRequestError && error.code === "P2002") throw new ConflictException("Ya existe una organizacion con ese slug.");
        throw error;
      }
    });
    return this.findOne(actor, organization.id);
  }

  async findOne(actor: CurrentUser, id: string) {
    const where = isSuperAdmin(actor) ? { id } : { id, users: { some: { id: actor.id } } };
    const organization = await this.prisma.client.organization.findFirst({ where, include: organizationCounts });
    if (!organization) throw new NotFoundException("Organizacion no encontrada.");
    return serializeOrganization(organization);
  }

  async current(actor: CurrentUser) {
    if (!actor.organizationId) throw new ForbiddenException("Tu usuario no pertenece a una organizacion.");
    return this.findOne(actor, actor.organizationId);
  }

  async update(actor: CurrentUser, id: string, body: unknown) {
    if (!isSuperAdmin(actor)) throw new ForbiddenException("Solo SUPERADMIN puede actualizar organizaciones.");
    const input = parseOrganizationUpdate(body);
    await this.prisma.client.$transaction(async (tx) => {
      let organization;
      try {
        organization = await tx.organization.update({ where: { id }, data: toOrganizationUpdate(input) });
      } catch (error) {
        if (error instanceof PrismaNamespace.PrismaClientKnownRequestError && error.code === "P2002") throw new ConflictException("Ya existe una organizacion con ese slug.");
        if (error instanceof PrismaNamespace.PrismaClientKnownRequestError && error.code === "P2025") throw new NotFoundException("Organizacion no encontrada.");
        throw error;
      }
      await tx.auditLog.create({ data: { userId: actor.id, organizationId: id, action: "UPDATE", entityType: "ORGANIZATION", entityId: id, metadata: { event: "ORGANIZATION_UPDATED", slug: organization.slug } } });
    });
    return this.findOne(actor, id);
  }

  async suspend(actor: CurrentUser, id: string) {
    return this.setStatus(actor, id, "SUSPENDED", "ORGANIZATION_SUSPENDED");
  }

  async activate(actor: CurrentUser, id: string) {
    return this.setStatus(actor, id, "ACTIVE", "ORGANIZATION_ACTIVATED");
  }

  private async setStatus(actor: CurrentUser, id: string, status: "ACTIVE" | "SUSPENDED", event: string) {
    if (!isSuperAdmin(actor)) throw new ForbiddenException("Solo SUPERADMIN puede cambiar el estado de organizaciones.");
    await this.prisma.client.$transaction(async (tx) => {
      try {
        await tx.organization.update({ where: { id }, data: { status } });
      } catch (error) {
        if (error instanceof PrismaNamespace.PrismaClientKnownRequestError && error.code === "P2025") throw new NotFoundException("Organizacion no encontrada.");
        throw error;
      }
      await tx.auditLog.create({ data: { userId: actor.id, organizationId: id, action: "UPDATE", entityType: "ORGANIZATION", entityId: id, metadata: { event, status } } });
    });
    return this.findOne(actor, id);
  }
}

const organizationCounts = { _count: { select: { users: true, templates: true, generations: true } } } as const;

function serializeOrganization<T extends { _count: { users: number; templates: number; generations: number } }>(organization: T) {
  return { ...organization, userCount: organization._count.users, templateCount: organization._count.templates, generationCount: organization._count.generations, _count: undefined };
}

function toOrganizationCreate(input: ReturnType<typeof parseOrganizationInput>): Prisma.OrganizationCreateInput {
  return {
    name: input.name,
    slug: input.slug ?? slugify(input.name),
    legalName: input.legalName ?? null,
    documentNumber: input.documentNumber ?? null,
    email: input.email ?? null,
    phone: input.phone ?? null,
    address: input.address ?? null,
  };
}

function toOrganizationUpdate(input: ReturnType<typeof parseOrganizationUpdate>): Prisma.OrganizationUpdateInput {
  const data: Prisma.OrganizationUpdateInput = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.slug !== undefined) data.slug = input.slug;
  if (input.legalName !== undefined) data.legalName = input.legalName;
  if (input.documentNumber !== undefined) data.documentNumber = input.documentNumber;
  if (input.email !== undefined) data.email = input.email;
  if (input.phone !== undefined) data.phone = input.phone;
  if (input.address !== undefined) data.address = input.address;
  return data;
}

function slugify(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100) || "organization";
}

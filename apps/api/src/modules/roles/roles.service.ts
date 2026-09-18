import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

import { PrismaService } from "../../common/database/prisma.service";
import { PERMISSION_GROUP_LABELS, SYSTEM_ROLES } from "../auth/authorization.constants";
import { isSuperAdmin } from "../auth/access-scope";
import type { CurrentUser } from "../auth/types/current-user";
import { parseRoleInput, parseRoleQuery, parseRoleUpdate } from "./dto";

@Injectable()
export class RolesService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(actor: CurrentUser, rawQuery: unknown = {}) {
    const query = parseRoleQuery(rawQuery);
    const where: Prisma.RoleWhereInput = {
      ...roleScope(actor),
      ...(query.status ? { isActive: query.status === "ACTIVE" } : {}),
      ...(query.search ? { OR: [{ name: { contains: query.search, mode: "insensitive" } }, { key: { contains: query.search, mode: "insensitive" } }] } : {}),
    };
    const orderBy = query.sortBy === "key" ? { key: query.sortOrder } : query.sortBy === "createdAt" ? { createdAt: query.sortOrder } : { name: query.sortOrder };
    const [items, total] = await this.prisma.client.$transaction([
      this.prisma.client.role.findMany({ where, orderBy, skip: (query.page - 1) * query.pageSize, take: query.pageSize, include: roleInclude }),
      this.prisma.client.role.count({ where }),
    ]);
    return { items: items.map(serializeRole), page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize) };
  }

  async findOne(actor: CurrentUser, id: string) {
    const role = await this.prisma.client.role.findFirst({ where: { id, ...roleScope(actor) }, include: roleInclude });
    if (!role) throw new NotFoundException("Rol no encontrado.");
    return serializeRole(role);
  }

  async create(actor: CurrentUser, body: unknown) {
    const input = parseRoleInput(body);
    const key = input.key ?? toRoleKey(input.name);
    assertNoProtectedSuperadminChange(actor, key, false);
    const role = await this.prisma.client.$transaction(async (tx) => {
      const permissionIds = await this.resolvePermissionIds(tx, input.permissionIds);
      const data: Prisma.RoleCreateInput = {
        key,
        name: input.name,
        description: input.description ?? null,
        isSystem: false,
        isActive: input.isActive,
      };
      if (permissionIds.length > 0) data.rolePermissions = { createMany: { data: permissionIds.map((permissionId) => ({ permissionId })), skipDuplicates: true } };
      const created = await tx.role.create({
        data,
      });
      await tx.auditLog.create({ data: { userId: actor.id, action: "CREATE", entityType: "ROLE", entityId: created.id, metadata: { event: "ROLE_CREATED", key } } });
      return created;
    });
    return this.findOne(actor, role.id);
  }

  async update(actor: CurrentUser, id: string, body: unknown) {
    const input = parseRoleUpdate(body);
    const current = await this.prisma.client.role.findFirst({ where: { id, ...roleScope(actor) }, include: roleInclude });
    if (!current) throw new NotFoundException("Rol no encontrado.");
    assertNoProtectedSuperadminChange(actor, current.key, current.isSystem);
    if (current.isSystem && input.key && input.key !== current.key) throw new ForbiddenException("No puedes cambiar la clave de un rol del sistema.");
    if (current.isSystem && current.key === SYSTEM_ROLES.SUPERADMIN && input.permissionIds) throw new ForbiddenException("No puedes cambiar permisos criticos de SUPERADMIN.");

    await this.prisma.client.$transaction(async (tx) => {
      const data: Prisma.RoleUpdateInput = {
        ...(input.name ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(input.key && !current.isSystem ? { key: input.key } : {}),
      };
      await tx.role.update({ where: { id }, data });
      if (input.permissionIds) {
        const permissionIds = await this.resolvePermissionIds(tx, input.permissionIds);
        await tx.rolePermission.deleteMany({ where: { roleId: id } });
        await tx.rolePermission.createMany({ data: permissionIds.map((permissionId) => ({ roleId: id, permissionId })), skipDuplicates: true });
      }
      await tx.auditLog.create({ data: { userId: actor.id, action: "UPDATE", entityType: "ROLE", entityId: id, metadata: { event: "ROLE_UPDATED", permissionIdsChanged: Boolean(input.permissionIds) } } });
    });
    return this.findOne(actor, id);
  }

  async remove(actor: CurrentUser, id: string) {
    const role = await this.prisma.client.role.findFirst({ where: { id, ...roleScope(actor) }, include: { _count: { select: { userRoles: true } } } });
    if (!role) throw new NotFoundException("Rol no encontrado.");
    assertNoProtectedSuperadminChange(actor, role.key, role.isSystem);
    if (role.isSystem) throw new ConflictException("Los roles del sistema no se eliminan.");
    if (role._count.userRoles > 0) throw new ConflictException("No se puede eliminar un rol asignado a usuarios.");
    await this.prisma.client.$transaction(async (tx) => {
      await tx.role.delete({ where: { id } });
      await tx.auditLog.create({ data: { userId: actor.id, action: "DELETE", entityType: "ROLE", entityId: id, metadata: { event: "ROLE_DELETED", key: role.key } } });
    });
    return { deleted: true, id };
  }

  async permissions() {
    const permissions = await this.prisma.client.permission.findMany({ orderBy: { key: "asc" } });
    return { items: permissions.map((permission) => {
      const group = permission.key.split(".")[0] ?? "otros";
      return { ...permission, group, groupLabel: PERMISSION_GROUP_LABELS[group] ?? "Otros" };
    }) };
  }

  private async resolvePermissionIds(tx: Prisma.TransactionClient, permissionIds: string[]) {
    const permissions = await tx.permission.findMany({ where: { id: { in: permissionIds } }, select: { id: true } });
    if (permissions.length !== permissionIds.length) throw new NotFoundException("Uno o mas permisos no existen.");
    return permissions.map((permission) => permission.id);
  }
}

function roleScope(actor: CurrentUser): Prisma.RoleWhereInput {
  if (isSuperAdmin(actor)) return {};
  return { isSystem: true };
}

const roleInclude = {
  rolePermissions: { include: { permission: true } },
  _count: { select: { userRoles: true, rolePermissions: true } },
} as const;

function serializeRole<T extends { rolePermissions: Array<{ permission: { id: string; key: string; name: string; description: string | null } }>; _count: { userRoles: number; rolePermissions: number } }>(role: T) {
  return { ...role, permissions: role.rolePermissions.map(({ permission }) => permission), userCount: role._count.userRoles, permissionCount: role._count.rolePermissions, rolePermissions: undefined };
}

function toRoleKey(name: string) {
  return name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 80) || "CUSTOM_ROLE";
}

function assertNoProtectedSuperadminChange(actor: CurrentUser, roleKey: string, isSystem: boolean) {
  if (roleKey === SYSTEM_ROLES.SUPERADMIN && !actor.authorization.roles.some((role) => role.key === SYSTEM_ROLES.SUPERADMIN)) {
    throw new ForbiddenException("No puedes modificar SUPERADMIN.");
  }
  if (isSystem && !actor.authorization.roles.some((role) => role.key === SYSTEM_ROLES.SUPERADMIN)) {
    throw new ForbiddenException("Solo SUPERADMIN puede modificar roles del sistema.");
  }
}

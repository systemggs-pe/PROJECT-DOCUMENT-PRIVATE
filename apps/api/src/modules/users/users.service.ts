import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

import { PrismaService } from "../../common/database/prisma.service";
import { SYSTEM_ROLES } from "../auth/authorization.constants";
import { AuthorizationService } from "../auth/services/authorization.service";
import { isAdmin, isSuperAdmin } from "../auth/access-scope";
import type { CurrentUser } from "../auth/types/current-user";
import { parseCreateUser, parseRoleAssignment, parseUpdateUser, parseUserQuery } from "./dto";

@Injectable()
export class UsersService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuthorizationService) private readonly authorization: AuthorizationService,
  ) {}

  async list(actor: CurrentUser, rawQuery: unknown = {}) {
    const query = parseUserQuery(rawQuery);
    const where: Prisma.UserWhereInput = {
      ...scopeWhere(actor),
      ...(query.status ? { isActive: query.status === "ACTIVE" } : {}),
      ...(query.search ? { OR: [{ email: { contains: query.search, mode: "insensitive" } }, { name: { contains: query.search, mode: "insensitive" } }] } : {}),
      ...(query.role ? { userRoles: { some: { role: { key: query.role } } } } : {}),
    };
    const orderBy = query.sortBy === "name" ? { name: query.sortOrder } : query.sortBy === "email" ? { email: query.sortOrder } : query.sortBy === "lastLoginAt" ? { lastLoginAt: query.sortOrder } : { createdAt: query.sortOrder };
    const [items, total] = await this.prisma.client.$transaction([
      this.prisma.client.user.findMany({ where, orderBy, skip: (query.page - 1) * query.pageSize, take: query.pageSize, include: userInclude }),
      this.prisma.client.user.count({ where }),
    ]);
    return { items: items.map(serializeUser), page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize) };
  }

  async findOne(actor: CurrentUser, id: string) {
    const user = await this.prisma.client.user.findFirst({ where: { id, ...scopeWhere(actor) }, include: userInclude });
    if (!user) throw new NotFoundException("Usuario no encontrado.");
    return serializeUser(user);
  }

  async create(actor: CurrentUser, body: unknown) {
    const input = parseCreateUser(body);
    const created = await this.prisma.client.$transaction(async (tx) => {
      const roleIds = await this.filterAssignableRoleIds(tx, actor, input.roleIds);
      const existing = await tx.user.findUnique({ where: { email: input.email.toLowerCase() }, select: { id: true } });
      if (existing) throw new ConflictException("Ya existe un usuario con ese correo.");
      const data: Prisma.UserCreateInput = {
        email: input.email.toLowerCase(),
        name: input.name ?? null,
        avatarUrl: input.avatarUrl ?? null,
        isActive: input.isActive,
      };
      if (isAdmin(actor)) data.managedBy = { connect: { id: actor.id } };
      if (roleIds.length > 0) data.userRoles = { createMany: { data: roleIds.map((roleId) => ({ roleId })), skipDuplicates: true } };
      const user = await tx.user.create({
        data,
      });
      await tx.auditLog.create({ data: { userId: actor.id, action: "CREATE", entityType: "USER", entityId: user.id, metadata: { event: "USER_CREATED", roleCount: roleIds.length } } });
      if (roleIds.length > 0) {
        await tx.auditLog.create({ data: { userId: actor.id, action: "ASSIGN", entityType: "ROLE", entityId: user.id, metadata: { event: "USER_ROLE_CHANGED", after: roleIds } } });
      }
      return user;
    });
    return this.findOne(actor, created.id);
  }

  async update(actor: CurrentUser, id: string, body: unknown) {
    const input = parseUpdateUser(body);
    const target = await this.requireScopedTarget(id, actor);
    assertCanChangeUser(actor, target, input.isActive);
    const data: Prisma.UserUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.avatarUrl !== undefined) data.avatarUrl = input.avatarUrl;
    if (input.isActive !== undefined) data.isActive = input.isActive;
    await this.prisma.client.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data });
      await tx.auditLog.create({ data: { userId: actor.id, action: "UPDATE", entityType: "USER", entityId: id, metadata: { event: "USER_UPDATED", fields: Object.keys(input) } } });
    });
    return this.findOne(actor, id);
  }

  async activate(actor: CurrentUser, id: string) {
    return this.setActive(actor, id, true);
  }

  async deactivate(actor: CurrentUser, id: string) {
    return this.setActive(actor, id, false);
  }

  async replaceRoles(actor: CurrentUser, id: string, body: unknown) {
    const input = parseRoleAssignment(body);
    const target = await this.requireScopedTarget(id, actor);
    if (target.id === actor.id) throw new ForbiddenException("No puedes modificar tus propios roles.");
    if (target.userRoles.some(({ role }) => role.key === SYSTEM_ROLES.SUPERADMIN) && !this.authorization.isSuperAdmin(actor.authorization)) throw new ForbiddenException("No puedes modificar roles de SUPERADMIN.");

    await this.prisma.client.$transaction(async (tx) => {
      const roleIds = await this.filterAssignableRoleIds(tx, actor, input.roleIds);
      await this.assertSuperadminContinuity(tx, target, roleIds);
      const before = await tx.userRole.findMany({ where: { userId: id }, select: { roleId: true } });
      await tx.userRole.deleteMany({ where: { userId: id } });
      await tx.userRole.createMany({ data: roleIds.map((roleId) => ({ userId: id, roleId })), skipDuplicates: true });
      await tx.auditLog.create({ data: { userId: actor.id, action: "ASSIGN", entityType: "ROLE", entityId: id, metadata: { event: "USER_ROLE_CHANGED", before: before.map((item) => item.roleId), after: roleIds } } });
    });
    return this.findOne(actor, id);
  }

  private async setActive(actor: CurrentUser, id: string, isActive: boolean) {
    const target = await this.requireScopedTarget(id, actor);
    assertCanChangeUser(actor, target, isActive);
    await this.prisma.client.$transaction(async (tx) => {
      if (!isActive) await this.assertCanDeactivateUser(tx, target);
      await tx.user.update({ where: { id }, data: { isActive } });
      await tx.auditLog.create({ data: { userId: actor.id, action: "UPDATE", entityType: "USER", entityId: id, metadata: { event: isActive ? "USER_ACTIVATED" : "USER_DEACTIVATED" } } });
    });
    return this.findOne(actor, id);
  }

  private async requireScopedTarget(id: string, actor: CurrentUser) {
    const user = await this.prisma.client.user.findFirst({ where: { id, ...scopeWhere(actor) }, include: userInclude });
    if (!user) throw new NotFoundException("Usuario no encontrado.");
    return user;
  }

  private async filterAssignableRoleIds(tx: Prisma.TransactionClient, actor: CurrentUser, roleIds: string[]) {
    const roles = await tx.role.findMany({
      where: {
        id: { in: roleIds },
        isActive: true,
        ...(isSuperAdmin(actor) ? {} : { isSystem: true }),
      },
      select: { id: true, key: true },
    });
    if (roles.length !== roleIds.length) throw new NotFoundException("Uno o mas roles no existen.");
    if (!this.authorization.isSuperAdmin(actor.authorization) && roles.some((role) => role.key === SYSTEM_ROLES.SUPERADMIN || role.key === SYSTEM_ROLES.ADMIN)) {
      throw new ForbiddenException("No puedes asignar roles administrativos.");
    }
    return roles.map((role) => role.id);
  }

  private async assertCanDeactivateUser(tx: Prisma.TransactionClient, target: UserTarget) {
    if (!isSuperadminTarget(target)) return;
    const activeSuperadmins = await countActiveSuperadmins(tx, target.id);
    if (activeSuperadmins === 0) throw new ForbiddenException("No puedes dejar el sistema sin SUPERADMIN activo.");
  }

  private async assertSuperadminContinuity(tx: Prisma.TransactionClient, target: UserTarget, nextRoleIds: string[]) {
    if (!isSuperadminTarget(target)) return;
    const nextRoles = nextRoleIds.length > 0 ? await tx.role.findMany({ where: { id: { in: nextRoleIds } }, select: { key: true } }) : [];
    if (nextRoles.some((role) => role.key === SYSTEM_ROLES.SUPERADMIN)) return;
    const activeSuperadmins = await countActiveSuperadmins(tx, target.id);
    if (activeSuperadmins === 0) throw new ForbiddenException("No puedes quitar el ultimo SUPERADMIN activo.");
  }

}

const userInclude = { userRoles: { include: { role: { select: { id: true, key: true, name: true, isSystem: true } } } } } as const;
type UserTarget = Prisma.UserGetPayload<{ include: typeof userInclude }>;

function scopeWhere(actor: CurrentUser): Prisma.UserWhereInput {
  if (isSuperAdmin(actor)) return {};
  if (isAdmin(actor)) return {};
  return { id: actor.id };
}

function serializeUser<T extends { userRoles: Array<{ role: { id: string; key: string; name: string; isSystem: boolean } }>; isActive: boolean }>(user: T) {
  return { ...user, status: user.isActive ? "ACTIVE" : "INACTIVE", roles: user.userRoles.map(({ role }) => role), userRoles: undefined };
}

function assertCanChangeUser(actor: CurrentUser, target: { id: string; userRoles: Array<{ role: { key: string } }> }, nextActive?: boolean) {
  if (target.id === actor.id && nextActive === false) throw new ForbiddenException("No puedes desactivar tu propia cuenta.");
  if (target.userRoles.some(({ role }) => role.key === SYSTEM_ROLES.SUPERADMIN) && !actor.authorization.roles.some((role) => role.key === SYSTEM_ROLES.SUPERADMIN)) {
    throw new ForbiddenException("No puedes modificar un SUPERADMIN.");
  }
}

function isSuperadminTarget(target: { isActive: boolean; userRoles: Array<{ role: { key: string } }> }) {
  return target.isActive && target.userRoles.some(({ role }) => role.key === SYSTEM_ROLES.SUPERADMIN);
}

async function countActiveSuperadmins(tx: Prisma.TransactionClient, excludingUserId: string) {
  return tx.user.count({
    where: {
      id: { not: excludingUserId },
      isActive: true,
      userRoles: { some: { role: { key: SYSTEM_ROLES.SUPERADMIN, isActive: true } } },
    },
  });
}

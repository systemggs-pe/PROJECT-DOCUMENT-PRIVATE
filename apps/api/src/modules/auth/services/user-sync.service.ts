import { ForbiddenException, Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { PrismaService } from "../../../common/database/prisma.service";
import { SYSTEM_ROLES } from "../authorization.constants";
import { AuthorizationService } from "./authorization.service";
import type { CurrentUser, SupabaseIdentity } from "../types/current-user";

@Injectable()
export class UserSyncService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(AuthorizationService) private readonly authorization: AuthorizationService,
  ) {}

  async sync(identity: SupabaseIdentity): Promise<CurrentUser> {
    const user = await this.prisma.client.$transaction(async (tx) => {
      const bootstrapSuperadmin = isBootstrapSuperadmin(identity.email, this.config.get<string>("SUPERADMIN_EMAIL"));
      const defaultOrganizationSlug = this.config.get<string>("DEFAULT_ORGANIZATION_SLUG") ?? "demo-organization";
      const defaultOrganization = bootstrapSuperadmin ? null : await tx.organization.findUnique({ where: { slug: defaultOrganizationSlug }, select: { id: true, name: true, slug: true, status: true } });
      let synced = await tx.user.upsert({
        where: {
          authProviderId: identity.authProviderId,
        },
        update: {
          email: identity.email,
          name: identity.name,
          avatarUrl: identity.avatarUrl,
          lastLoginAt: new Date(),
          ...(bootstrapSuperadmin ? { organizationId: null } : {}),
        },
        create: {
          authProviderId: identity.authProviderId,
          email: identity.email,
          name: identity.name,
          avatarUrl: identity.avatarUrl,
          lastLoginAt: new Date(),
          organizationId: defaultOrganization?.id ?? null,
        },
        include: { userRoles: true, organization: true },
      });

      if (!bootstrapSuperadmin && !synced.organizationId && defaultOrganization) {
        synced = await tx.user.update({ where: { id: synced.id }, data: { organizationId: defaultOrganization.id }, include: { userRoles: true, organization: true } });
      }

      const roleKey = bootstrapSuperadmin ? SYSTEM_ROLES.SUPERADMIN : SYSTEM_ROLES.USER;
      const role = await tx.role.findUnique({ where: { key: roleKey }, select: { id: true } });
      if (role && synced.userRoles.length === 0) {
        await tx.userRole.create({ data: { userId: synced.id, roleId: role.id } });
        await tx.auditLog.create({ data: { userId: synced.id, action: "ASSIGN", entityType: "ROLE", entityId: role.id, metadata: { event: "ROLE_ASSIGNED_ON_SYNC", role: roleKey } } });
      }

      return synced;
    });

    if (!user.isActive) {
      throw new ForbiddenException("User account is disabled");
    }
    const snapshot = await this.authorization.getSnapshot(user.id);
    const isSuperadmin = snapshot.roles.some((role) => role.key === SYSTEM_ROLES.SUPERADMIN);
    if (!isSuperadmin && user.organization?.status !== "ACTIVE") {
      throw new ForbiddenException("La organizacion no esta activa.");
    }

    return {
      id: user.id,
      authProviderId: user.authProviderId ?? identity.authProviderId,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      isActive: user.isActive,
      status: user.isActive ? "ACTIVE" : "INACTIVE",
      organizationId: user.organizationId,
      organization: user.organization ? { id: user.organization.id, name: user.organization.name, slug: user.organization.slug, status: user.organization.status } : null,
      roles: snapshot.roles,
      permissions: snapshot.permissions,
      authorization: snapshot,
    };
  }
}

function isBootstrapSuperadmin(email: string, configuredEmail?: string) {
  return Boolean(configuredEmail && email.trim().toLowerCase() === configuredEmail.trim().toLowerCase());
}

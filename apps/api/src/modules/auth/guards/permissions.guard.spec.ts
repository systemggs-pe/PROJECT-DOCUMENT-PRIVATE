import { ForbiddenException } from "@nestjs/common";
import type { ExecutionContext } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import type { PermissionKey } from "../authorization.constants";
import { PermissionsGuard } from "./permissions.guard";

describe("PermissionsGuard", () => {
  it("allows endpoints without authorization metadata", () => {
    const guard = new PermissionsGuard(reflector([], []), authorization());
    expect(guard.canActivate(context(user(["generations.read"], ["USER"])))).toBe(true);
  });

  it("rejects an authenticated user without the required permission", () => {
    const guard = new PermissionsGuard(reflector(["users.read"], []), authorization());
    expect(() => guard.canActivate(context(user(["generations.read"], ["USER"])))).toThrow(ForbiddenException);
  });

  it("allows a user with the required permission", () => {
    const guard = new PermissionsGuard(reflector(["generations.read"], []), authorization());
    expect(guard.canActivate(context(user(["generations.read"], ["USER"])))).toBe(true);
  });

  it("allows SUPERADMIN through permission checks", () => {
    const guard = new PermissionsGuard(reflector(["roles.delete"], []), authorization());
    expect(guard.canActivate(context(user([], ["SUPERADMIN"])))).toBe(true);
  });

  it("rejects missing required roles", () => {
    const guard = new PermissionsGuard(reflector([], ["SUPERADMIN"]), authorization());
    expect(() => guard.canActivate(context(user(["users.read"], ["ADMIN"])))).toThrow(ForbiddenException);
  });
});

function reflector(permissions: PermissionKey[], roles: string[]) {
  return {
    getAllAndOverride: vi.fn((key: string) => key.includes("permissions") ? permissions : key.includes("roles") ? roles : false),
  } as never;
}

function authorization() {
  return {
    hasAnyRole: (_snapshot: unknown, roles: readonly string[]) => roles.length === 0 || roles.includes("SUPERADMIN") && userRoles(_snapshot).includes("SUPERADMIN"),
    hasAllPermissions: (snapshot: { roles: Array<{ key: string }>; permissions: PermissionKey[] }, permissions: readonly PermissionKey[]) => snapshot.roles.some((role) => role.key === "SUPERADMIN") || permissions.every((permission) => snapshot.permissions.includes(permission)),
  } as never;
}

function context(currentUser: ReturnType<typeof user>) {
  return {
    getHandler: vi.fn(),
    getClass: vi.fn(),
    switchToHttp: () => ({ getRequest: () => ({ user: currentUser }) }),
  } as unknown as ExecutionContext;
}

function user(permissions: PermissionKey[], roleKeys: string[]) {
  const roles = roleKeys.map((key) => ({ id: key, key, name: key, isSystem: true }));
  return { id: "user-id", authProviderId: "auth-id", email: "user@example.com", name: null, avatarUrl: null, isActive: true, status: "ACTIVE" as const, organizationId: "organization-id", organization: { id: "organization-id", name: "Test organization", slug: "test-organization", status: "ACTIVE" as const }, roles, permissions, authorization: { roles, permissions } };
}

function userRoles(snapshot: unknown) {
  return (snapshot as { roles: Array<{ key: string }> }).roles.map((role) => role.key);
}

import { UnauthorizedException } from "@nestjs/common";
import type { Reflector } from "@nestjs/core";
import type { ExecutionContext } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { SupabaseAuthGuard } from "./supabase-auth.guard";
import type { SupabaseJwtVerifierService } from "../services/supabase-jwt-verifier.service";
import type { UserSyncService } from "../services/user-sync.service";

describe("SupabaseAuthGuard", () => {
  it("allows public routes without requiring a token", async () => {
    const guard = new SupabaseAuthGuard(
      { getAllAndOverride: () => true } as unknown as Reflector,
      { verify: vi.fn() } as unknown as SupabaseJwtVerifierService,
      { sync: vi.fn() } as unknown as UserSyncService,
    );

    await expect(guard.canActivate(createContext())).resolves.toBe(true);
  });

  it("rejects requests without a bearer token with 401", async () => {
    const guard = createGuard();

    await expect(guard.canActivate(createContext())).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("validates the token, syncs the user, and attaches CurrentUser", async () => {
    const request = { headers: { authorization: "Bearer valid-token" } };
    const identity = {
      authProviderId: "4eb77b04-1389-48df-8d3c-e7de38e63f7c",
      email: "user@example.com",
      name: null,
      avatarUrl: null,
    };
    const user = {
      id: "local-user-id",
      authProviderId: identity.authProviderId,
      email: identity.email,
      name: null,
      avatarUrl: null,
      isActive: true,
    };
    const verify = vi.fn().mockResolvedValue(identity);
    const sync = vi.fn().mockResolvedValue(user);
    const guard = createGuard(verify, sync);

    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);
    expect(verify).toHaveBeenCalledWith("valid-token");
    expect(sync).toHaveBeenCalledWith(identity);
    expect(request).toMatchObject({ user });
  });
});

function createGuard(verify = vi.fn(), sync = vi.fn()): SupabaseAuthGuard {
  return new SupabaseAuthGuard(
    { getAllAndOverride: () => false } as unknown as Reflector,
    { verify } as unknown as SupabaseJwtVerifierService,
    { sync } as unknown as UserSyncService,
  );
}

function createContext(request: { headers: Record<string, string> } = { headers: {} }): ExecutionContext {
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

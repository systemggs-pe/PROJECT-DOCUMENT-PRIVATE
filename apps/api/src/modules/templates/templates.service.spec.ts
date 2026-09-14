import { BadRequestException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import type { PrismaService } from "../../common/database/prisma.service";
import type { CurrentUser } from "../auth/types/current-user";
import { TemplatesService } from "./templates.service";

describe("TemplatesService", () => {
  it("lists only templates owned by the current user", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const count = vi.fn().mockResolvedValue(0);
    const transaction = vi.fn().mockResolvedValue([[], 0]);
    const service = new TemplatesService({ client: { template: { findMany, count }, $transaction: transaction } } as unknown as PrismaService);

    await expect(service.listOwned(actor("user-a"))).resolves.toMatchObject({ items: [], page: 1, pageSize: 20, total: 0, totalPages: 0 });

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: "org-a", createdById: "user-a" } }));
    expect(count).toHaveBeenCalledWith({ where: { organizationId: "org-a", createdById: "user-a" } });
    expect(transaction).toHaveBeenCalledOnce();
  });

  it("validates safe filters and rejects arbitrary sorting", async () => {
    const service = new TemplatesService({ client: { template: { findMany: vi.fn(), count: vi.fn() }, $transaction: vi.fn().mockResolvedValue([[], 0]) } } as unknown as PrismaService);

    await expect(service.listOwned(actor("user-a"), { search: "DNI", status: "ACTIVE", sortBy: "name", sortOrder: "asc", page: "2", pageSize: "10" })).resolves.toMatchObject({ page: 2, pageSize: 10 });
    await expect(service.listOwned(actor("user-a"), { sortBy: "createdById" })).rejects.toBeInstanceOf(BadRequestException);
  });

  it("returns 404 for missing or foreign templates", async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const service = new TemplatesService({ client: { template: { findFirst } } } as unknown as PrismaService);

    await expect(service.findOwnedOrThrow("template-b", actor("user-a"))).rejects.toBeInstanceOf(NotFoundException);
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "template-b", organizationId: "org-a", createdById: "user-a" } }));
  });
});

function actor(id: string): CurrentUser {
  const roles = [{ id: "USER", key: "USER", name: "Usuario", isSystem: true }];
  return { id, authProviderId: id, email: `${id}@example.com`, name: null, avatarUrl: null, isActive: true, status: "ACTIVE", organizationId: "org-a", organization: { id: "org-a", name: "Org A", slug: "org-a", status: "ACTIVE" }, roles, permissions: [], authorization: { roles, permissions: [] } };
}

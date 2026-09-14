import { describe, expect, it } from "vitest";

import { AppController } from "./app.controller";
import type { PrismaService } from "./common/database/prisma.service";

describe("AppController", () => {
  it("returns the health status", async () => {
    const prisma = {
      checkHealth: async () => "not_configured" as const,
    } satisfies Pick<PrismaService, "checkHealth">;

    await expect(new AppController(prisma as PrismaService).health()).resolves.toEqual({
      status: "ok",
      service: "ggs-document-studio-api",
      database: "not_configured",
    });
  });
});

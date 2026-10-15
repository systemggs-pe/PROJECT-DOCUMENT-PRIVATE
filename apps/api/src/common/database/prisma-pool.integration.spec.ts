import { ConfigService } from "@nestjs/config";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { describe, expect, it } from "vitest";
import { PrismaService } from "./prisma.service";

const isolated = process.env.GGS_ISOLATED_VALIDATION === "1";

describe.skipIf(!isolated)("PrismaService against isolated PostgreSQL", () => {
  it("bounds concurrent transactions, recovers from rollback, evicts idle connections and closes its pool", async () => {
    const url = new URL(process.env.DATABASE_URL!);
    if (url.hostname !== "postgres" || url.pathname !== "/ggs_netlify_validation") throw new Error("An isolated Compose database is required");
    const name = `ggs_pool_${randomUUID()}`;
    url.searchParams.set("application_name", name);
    const service = new PrismaService(new ConfigService({ DATABASE_URL: url.toString(), DATABASE_POOL_MAX: "2" }));
    const observer = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
    const count = async () => Number((await observer.query("SELECT count(*) FROM pg_stat_activity WHERE application_name = $1", [name])).rows[0].count);
    try {
      await service.onModuleInit();
      const pids = new Set<number>();
      const pending = Promise.all(Array.from({ length: 20 }, () => service.client.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid FROM pg_sleep(0.025)`;
        pids.add(rows[0]!.pid);
      })));
      await expect(pending).resolves.toHaveLength(20);
      expect(pids.size).toBeGreaterThan(0);
      expect(pids.size).toBeLessThanOrEqual(2);
      expect(await count()).toBeLessThanOrEqual(2);
      await expect(service.client.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT 1 / 0 AS invalid`;
      })).rejects.toThrow();
      expect(await service.checkHealth()).toBe("connected");
      const reused = await service.client.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`;
      expect(pids.has(reused[0]!.pid)).toBe(true);
      await new Promise((resolve) => setTimeout(resolve, 10_500));
      expect(await count()).toBe(0);
      expect(await service.checkHealth()).toBe("connected");
      await service.onModuleDestroy();
      expect(await count()).toBe(0);
    } finally {
      // A fresh service is used per test; end remains safe if the assertions failed earlier.
      if (await count()) await service.onModuleDestroy();
      await observer.end();
    }
  }, 25_000);

  it("applies a separate budget to simultaneous warm instances", async () => {
    const names = [randomUUID(), randomUUID()].map((id) => `ggs_instance_${id}`);
    const services = names.map((name) => {
      const url = new URL(process.env.DATABASE_URL!);
      if (url.hostname !== "postgres" || url.pathname !== "/ggs_netlify_validation") throw new Error("An isolated Compose database is required");
      url.searchParams.set("application_name", name);
      return new PrismaService(new ConfigService({ DATABASE_URL: url.toString(), DATABASE_POOL_MAX: "2" }));
    });
    const observer = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
    try {
      await Promise.all(services.map((service) => service.onModuleInit()));
      await Promise.all(services.flatMap((service) => Array.from({ length: 10 }, () => service.client.$queryRaw`SELECT 1 AS value FROM pg_sleep(0.025)`)));
      const active = await observer.query("SELECT application_name, count(*)::int AS count FROM pg_stat_activity WHERE application_name = ANY($1) GROUP BY application_name", [names]);
      expect(active.rows).toHaveLength(2);
      for (const row of active.rows) expect(row.count).toBeLessThanOrEqual(2);
    } finally {
      await Promise.all(services.map((service) => service.onModuleDestroy()));
      expect(Number((await observer.query("SELECT count(*) FROM pg_stat_activity WHERE application_name = ANY($1)", [names])).rows[0].count)).toBe(0);
      await observer.end();
    }
  });
});

import { Inject, Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import type { OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";

export type DatabaseHealth = "not_configured" | "connected" | "unreachable";

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private readonly pool: Pool | null;
  private readonly prismaClient: PrismaClient | null;

  constructor(@Inject(ConfigService) configService: ConfigService) {
    const databaseUrl = configService.get<string>("DATABASE_URL");

    if (!databaseUrl) {
      this.pool = null;
      this.prismaClient = null;
      return;
    }

    this.pool = new Pool({
      connectionString: databaseUrl,
      max: parsePoolMax(configService.get<string>("DATABASE_POOL_MAX")),
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 10000,
      allowExitOnIdle: true,
    });
    this.pool.on("error", () => this.logger.error("An idle PostgreSQL connection failed; the pool will replace it."));

    this.prismaClient = new PrismaClient({
      adapter: new PrismaPg(this.pool),
      log: ["warn", "error"],
    });
  }

  get isConfigured(): boolean {
    return this.prismaClient !== null;
  }

  get client(): PrismaClient {
    if (!this.prismaClient) {
      throw new ServiceUnavailableException("Database is not configured");
    }

    return this.prismaClient;
  }

  async onModuleInit(): Promise<void> {
    if (this.prismaClient) {
      await this.prismaClient.$connect();
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.prismaClient?.$disconnect();
    await this.pool?.end();
  }

  async checkHealth(): Promise<DatabaseHealth> {
    if (!this.prismaClient) {
      return "not_configured";
    }

    try {
      await this.prismaClient.$queryRaw`SELECT 1`;
      return "connected";
    } catch {
      return "unreachable";
    }
  }
}

export function parsePoolMax(value: string | undefined): number {
  const max = Number(value ?? 2);
  if (!Number.isInteger(max) || max < 1 || max > 10) throw new Error("DATABASE_POOL_MAX must be an integer between 1 and 10");
  return max;
}

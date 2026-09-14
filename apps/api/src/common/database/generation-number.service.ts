import { Inject, Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

import { PrismaService } from "./prisma.service";

const DEFAULT_COUNTER_KEY = "default";
const DEFAULT_PREFIX = "GGS";
const DEFAULT_PADDING = 6;

interface CounterRow {
  current_value: number;
  prefix: string;
  padding: number;
}

export interface GenerationNumber {
  sequenceNumber: number;
  number: string;
}

@Injectable()
export class GenerationNumberService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async next(counterKey = DEFAULT_COUNTER_KEY, database: Pick<Prisma.TransactionClient, "$queryRaw"> = this.prisma.client): Promise<GenerationNumber> {
    const rows = await database.$queryRaw<CounterRow[]>`
      INSERT INTO generation_counters (key, prefix, padding, current_value, created_at, updated_at)
      VALUES (${counterKey}, ${DEFAULT_PREFIX}, ${DEFAULT_PADDING}, 1, NOW(), NOW())
      ON CONFLICT (key)
      DO UPDATE SET current_value = generation_counters.current_value + 1, updated_at = NOW()
      RETURNING current_value, prefix, padding
    `;

    const counter = rows[0];

    if (!counter) {
      throw new Error("Generation counter did not return a value");
    }

    return {
      sequenceNumber: counter.current_value,
      number: formatGenerationNumber(counter.prefix, counter.current_value, counter.padding),
    };
  }
}

export function formatGenerationNumber(prefix: string, value: number, padding: number): string {
  return `${prefix}-${value.toString().padStart(padding, "0")}`;
}

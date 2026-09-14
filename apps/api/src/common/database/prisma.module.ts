import { Module } from "@nestjs/common";

import { GenerationNumberService } from "./generation-number.service";
import { PrismaService } from "./prisma.service";

@Module({
  providers: [PrismaService, GenerationNumberService],
  exports: [PrismaService, GenerationNumberService],
})
export class PrismaModule {}

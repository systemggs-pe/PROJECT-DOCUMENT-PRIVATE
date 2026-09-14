import { Module } from "@nestjs/common";

import { PrismaModule } from "../../common/database/prisma.module";
import { TemplateVersionsController } from "./template-versions.controller";
import { TemplateVersionsService } from "./template-versions.service";

@Module({
  imports: [PrismaModule],
  controllers: [TemplateVersionsController],
  providers: [TemplateVersionsService],
  exports: [TemplateVersionsService],
})
export class TemplateVersionsModule {}

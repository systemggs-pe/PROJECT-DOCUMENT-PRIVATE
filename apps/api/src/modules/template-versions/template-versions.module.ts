import { Module } from "@nestjs/common";

import { TemplateVersionsController } from "./template-versions.controller";
import { TemplateVersionsService } from "./template-versions.service";

@Module({
  controllers: [TemplateVersionsController],
  providers: [TemplateVersionsService],
  exports: [TemplateVersionsService],
})
export class TemplateVersionsModule {}

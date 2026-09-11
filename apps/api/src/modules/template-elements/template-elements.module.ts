import { Module } from "@nestjs/common";

import { TemplateElementsController } from "./template-elements.controller";
import { TemplateElementsService } from "./template-elements.service";

@Module({
  controllers: [TemplateElementsController],
  providers: [TemplateElementsService],
  exports: [TemplateElementsService],
})
export class TemplateElementsModule {}

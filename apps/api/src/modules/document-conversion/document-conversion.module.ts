import { Module } from "@nestjs/common";

import { DocumentConversionService } from "./document-conversion.service";

@Module({
  providers: [DocumentConversionService],
  exports: [DocumentConversionService],
})
export class DocumentConversionModule {}

import { Module } from "@nestjs/common";

import { PrismaModule } from "../../common/database/prisma.module";
import { GenerationsController } from "./generations.controller";
import { GenerationsService } from "./generations.service";
import { GenerationRunnerService } from "./generation-runner.service";
import { StorageModule } from "../storage/storage.module";
import { PdfModule } from "../pdf/pdf.module";
import { DocumentConversionModule } from "../document-conversion/document-conversion.module";

@Module({
  imports: [PrismaModule, StorageModule, PdfModule, DocumentConversionModule],
  controllers: [GenerationsController],
  providers: [GenerationsService, GenerationRunnerService],
  exports: [GenerationsService],
})
export class GenerationsModule {}

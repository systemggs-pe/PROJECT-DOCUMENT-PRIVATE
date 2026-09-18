import { Module } from "@nestjs/common";

import { PrismaModule } from "../../common/database/prisma.module";
import { FileFieldsController } from "./file-fields.controller";
import { FileFieldsService } from "./file-fields.service";

@Module({
  imports: [PrismaModule],
  controllers: [FileFieldsController],
  providers: [FileFieldsService],
  exports: [FileFieldsService],
})
export class FileFieldsModule {}

import { Module } from "@nestjs/common";

import { PrismaModule } from "../../common/database/prisma.module";
import { FilesController } from "./files.controller";
import { FilesService } from "./files.service";
import { StorageModule } from "../storage/storage.module";

@Module({
  imports: [PrismaModule, StorageModule],
  controllers: [FilesController],
  providers: [FilesService],
  exports: [FilesService],
})
export class FilesModule {}

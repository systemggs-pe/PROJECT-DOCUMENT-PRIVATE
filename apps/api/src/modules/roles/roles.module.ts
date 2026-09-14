import { Module } from "@nestjs/common";

import { PrismaModule } from "../../common/database/prisma.module";
import { AuthModule } from "../auth/auth.module";
import { RolesController } from "./roles.controller";
import { RolesService } from "./roles.service";

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [RolesController],
  providers: [RolesService],
  exports: [RolesService],
})
export class RolesModule {}

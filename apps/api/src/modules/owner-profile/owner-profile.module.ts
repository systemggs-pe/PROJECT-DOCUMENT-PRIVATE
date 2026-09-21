import { Module } from "@nestjs/common";

import { PrismaModule } from "../../common/database/prisma.module";
import { OwnerProfileController } from "./owner-profile.controller";
import { OwnerProfileService } from "./owner-profile.service";

@Module({
  imports: [PrismaModule],
  controllers: [OwnerProfileController],
  providers: [OwnerProfileService],
  exports: [OwnerProfileService],
})
export class OwnerProfileModule {}

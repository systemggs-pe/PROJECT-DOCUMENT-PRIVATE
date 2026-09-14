import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";

import { PrismaModule } from "../../common/database/prisma.module";
import { AuthController } from "./auth.controller";
import { SupabaseAuthGuard } from "./guards/supabase-auth.guard";
import { PermissionsGuard } from "./guards/permissions.guard";
import { AuthService } from "./auth.service";
import { AuthorizationService } from "./services/authorization.service";
import { SupabaseJwtVerifierService } from "./services/supabase-jwt-verifier.service";
import { UserSyncService } from "./services/user-sync.service";

@Module({
  imports: [PrismaModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthorizationService,
    SupabaseJwtVerifierService,
    UserSyncService,
    {
      provide: APP_GUARD,
      useClass: SupabaseAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: PermissionsGuard,
    },
  ],
  exports: [AuthService, AuthorizationService, SupabaseJwtVerifierService, UserSyncService],
})
export class AuthModule {}

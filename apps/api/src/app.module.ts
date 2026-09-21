import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { AppController } from "./app.controller";
import { PrismaModule } from "./common/database/prisma.module";
import { AuditModule } from "./modules/audit/audit.module";
import { AuthModule } from "./modules/auth/auth.module";
import { OwnerProfileModule } from "./modules/owner-profile/owner-profile.module";
import { FilesModule } from "./modules/files/files.module";
import { FileFieldsModule } from "./modules/file-fields/file-fields.module";
import { GenerationsModule } from "./modules/generations/generations.module";
import { PdfModule } from "./modules/pdf/pdf.module";
import { RolesModule } from "./modules/roles/roles.module";
import { StorageModule } from "./modules/storage/storage.module";
import { TemplateElementsModule } from "./modules/template-elements/template-elements.module";
import { TemplateVersionsModule } from "./modules/template-versions/template-versions.module";
import { TemplatesModule } from "./modules/templates/templates.module";
import { UsersModule } from "./modules/users/users.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: [".env", "../../.env"],
      isGlobal: true,
    }),
    PrismaModule,
    AuthModule,
    OwnerProfileModule,
    UsersModule,
    RolesModule,
    TemplatesModule,
    TemplateVersionsModule,
    TemplateElementsModule,
    FilesModule,
    FileFieldsModule,
    GenerationsModule,
    PdfModule,
    StorageModule,
    AuditModule,
  ],
  controllers: [AppController],
})
export class AppModule {}

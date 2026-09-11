import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { AppController } from "./app.controller";
import { AuditModule } from "./modules/audit/audit.module";
import { AuthModule } from "./modules/auth/auth.module";
import { FilesModule } from "./modules/files/files.module";
import { GenerationsModule } from "./modules/generations/generations.module";
import { PdfModule } from "./modules/pdf/pdf.module";
import { StorageModule } from "./modules/storage/storage.module";
import { TemplateElementsModule } from "./modules/template-elements/template-elements.module";
import { TemplateVersionsModule } from "./modules/template-versions/template-versions.module";
import { TemplatesModule } from "./modules/templates/templates.module";
import { UsersModule } from "./modules/users/users.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    AuthModule,
    UsersModule,
    TemplatesModule,
    TemplateVersionsModule,
    TemplateElementsModule,
    FilesModule,
    GenerationsModule,
    PdfModule,
    StorageModule,
    AuditModule,
  ],
  controllers: [AppController],
})
export class AppModule {}

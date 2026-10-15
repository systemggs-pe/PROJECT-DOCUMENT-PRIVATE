import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import type { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { HttpExceptionFilter } from "./common/filters/http-exception.filter";
import { getCorsOrigins, isCorsOriginAllowed } from "./cors";

export async function createApplication(production = process.env.NODE_ENV === "production"): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule, { abortOnError: false });
  const corsEnvironment = production ? "production" : process.env.NODE_ENV;
  const origins = getCorsOrigins(app.get(ConfigService).get<string>("CORS_ORIGIN"), corsEnvironment);
  app.enableCors({
    origin: (origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) => {
      callback(null, isCorsOriginAllowed(origin, origins, corsEnvironment));
    },
    credentials: true,
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.useGlobalFilters(new HttpExceptionFilter());
  return app;
}

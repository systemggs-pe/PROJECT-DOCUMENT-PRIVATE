import { defineConfig } from "prisma/config";

const shadowDatabaseUrl = process.env["SHADOW_DATABASE_URL"];

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url:
      process.env["DATABASE_URL"] ??
      "postgresql://ggs:desarrollo-local@localhost:5432/ggs_document_studio?schema=public",
    ...(shadowDatabaseUrl ? { shadowDatabaseUrl } : {}),
  },
});

CREATE TYPE "OrganizationStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'ARCHIVED');

CREATE TABLE "organizations" (
  "id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "legal_name" TEXT,
  "document_number" TEXT,
  "email" TEXT,
  "phone" TEXT,
  "address" TEXT,
  "status" "OrganizationStatus" NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");
CREATE INDEX "organizations_slug_idx" ON "organizations"("slug");
CREATE INDEX "organizations_status_idx" ON "organizations"("status");

INSERT INTO "organizations" ("id", "name", "slug", "legal_name", "status", "updated_at")
VALUES ('00000000-0000-4000-8000-000000000201', 'Organization Demo', 'demo-organization', 'GGS Demo', 'ACTIVE', CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO UPDATE SET "name" = EXCLUDED."name", "updated_at" = CURRENT_TIMESTAMP;

ALTER TABLE "users" ADD COLUMN "organization_id" UUID;
ALTER TABLE "roles" ADD COLUMN "organization_id" UUID;
ALTER TABLE "templates" ADD COLUMN "organization_id" UUID;
ALTER TABLE "stored_files" ADD COLUMN "organization_id" UUID;
ALTER TABLE "generations" ADD COLUMN "organization_id" UUID;
ALTER TABLE "audit_logs" ADD COLUMN "organization_id" UUID;

UPDATE "users"
SET "organization_id" = '00000000-0000-4000-8000-000000000201'
WHERE "organization_id" IS NULL;

UPDATE "templates" t
SET "organization_id" = COALESCE(u."organization_id", '00000000-0000-4000-8000-000000000201')
FROM "users" u
WHERE t."created_by_id" = u."id" AND t."organization_id" IS NULL;

UPDATE "stored_files" f
SET "organization_id" = COALESCE(u."organization_id", '00000000-0000-4000-8000-000000000201')
FROM "users" u
WHERE f."created_by_id" = u."id" AND f."organization_id" IS NULL;

UPDATE "generations" g
SET "organization_id" = COALESCE(u."organization_id", '00000000-0000-4000-8000-000000000201')
FROM "users" u
WHERE g."created_by_id" = u."id" AND g."organization_id" IS NULL;

UPDATE "templates"
SET "organization_id" = '00000000-0000-4000-8000-000000000201'
WHERE "organization_id" IS NULL;

UPDATE "stored_files"
SET "organization_id" = '00000000-0000-4000-8000-000000000201'
WHERE "organization_id" IS NULL;

UPDATE "generations"
SET "organization_id" = '00000000-0000-4000-8000-000000000201'
WHERE "organization_id" IS NULL;

UPDATE "audit_logs" a
SET "organization_id" = u."organization_id"
FROM "users" u
WHERE a."user_id" = u."id" AND a."organization_id" IS NULL;

ALTER TABLE "templates" ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "stored_files" ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "generations" ALTER COLUMN "organization_id" SET NOT NULL;

ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "roles" ADD CONSTRAINT "roles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "templates" ADD CONSTRAINT "templates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "generations" ADD CONSTRAINT "generations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "users_organization_id_idx" ON "users"("organization_id");
CREATE INDEX "roles_organization_id_idx" ON "roles"("organization_id");
CREATE INDEX "templates_organization_id_idx" ON "templates"("organization_id");
CREATE INDEX "templates_organization_id_status_idx" ON "templates"("organization_id", "status");
CREATE INDEX "stored_files_organization_id_idx" ON "stored_files"("organization_id");
CREATE INDEX "stored_files_organization_id_type_idx" ON "stored_files"("organization_id", "type");
CREATE INDEX "generations_organization_id_idx" ON "generations"("organization_id");
CREATE INDEX "generations_organization_id_created_at_idx" ON "generations"("organization_id", "created_at");
CREATE INDEX "audit_logs_organization_id_idx" ON "audit_logs"("organization_id");

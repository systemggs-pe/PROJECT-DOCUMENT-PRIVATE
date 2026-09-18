CREATE TABLE IF NOT EXISTS "company_settings" (
  "id" TEXT NOT NULL DEFAULT 'global',
  "name" TEXT NOT NULL DEFAULT 'GGS Document Studio',
  "legal_name" TEXT,
  "document_number" TEXT,
  "email" TEXT,
  "phone" TEXT,
  "address" TEXT,
  "logo_url" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "company_settings_pkey" PRIMARY KEY ("id")
);

ALTER TYPE "AuditEntityType" ADD VALUE IF NOT EXISTS 'COMPANY_SETTINGS';

INSERT INTO "company_settings" ("id", "name", "legal_name", "document_number", "email", "phone", "address", "metadata", "created_at", "updated_at")
SELECT
  'global',
  COALESCE((SELECT "name" FROM "organizations" ORDER BY "created_at" ASC LIMIT 1), 'GGS Document Studio'),
  (SELECT "legal_name" FROM "organizations" ORDER BY "created_at" ASC LIMIT 1),
  (SELECT "document_number" FROM "organizations" ORDER BY "created_at" ASC LIMIT 1),
  (SELECT "email" FROM "organizations" ORDER BY "created_at" ASC LIMIT 1),
  (SELECT "phone" FROM "organizations" ORDER BY "created_at" ASC LIMIT 1),
  (SELECT "address" FROM "organizations" ORDER BY "created_at" ASC LIMIT 1),
  jsonb_build_object('source', 'single-company-refactor'),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "company_settings" WHERE "id" = 'global');

ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_organization_id_fkey";
ALTER TABLE "roles" DROP CONSTRAINT IF EXISTS "roles_organization_id_fkey";
ALTER TABLE "templates" DROP CONSTRAINT IF EXISTS "templates_organization_id_fkey";
ALTER TABLE "stored_files" DROP CONSTRAINT IF EXISTS "stored_files_organization_id_fkey";
ALTER TABLE "generations" DROP CONSTRAINT IF EXISTS "generations_organization_id_fkey";
ALTER TABLE "audit_logs" DROP CONSTRAINT IF EXISTS "audit_logs_organization_id_fkey";

DROP INDEX IF EXISTS "users_organization_id_idx";
DROP INDEX IF EXISTS "roles_organization_id_idx";
DROP INDEX IF EXISTS "templates_organization_id_idx";
DROP INDEX IF EXISTS "templates_organization_id_status_idx";
DROP INDEX IF EXISTS "stored_files_organization_id_idx";
DROP INDEX IF EXISTS "stored_files_organization_id_type_idx";
DROP INDEX IF EXISTS "generations_organization_id_idx";
DROP INDEX IF EXISTS "generations_organization_id_created_at_idx";
DROP INDEX IF EXISTS "audit_logs_organization_id_idx";

ALTER TABLE "users" DROP COLUMN IF EXISTS "organization_id";
ALTER TABLE "roles" DROP COLUMN IF EXISTS "organization_id";
ALTER TABLE "templates" DROP COLUMN IF EXISTS "organization_id";
ALTER TABLE "stored_files" DROP COLUMN IF EXISTS "organization_id";
ALTER TABLE "generations" DROP COLUMN IF EXISTS "organization_id";
ALTER TABLE "audit_logs" DROP COLUMN IF EXISTS "organization_id";

DROP TABLE IF EXISTS "organizations";
DROP TYPE IF EXISTS "OrganizationStatus";

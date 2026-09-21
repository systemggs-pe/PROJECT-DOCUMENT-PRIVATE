ALTER TABLE "company_settings"
  DROP CONSTRAINT IF EXISTS "company_settings_logo_file_id_fkey";

DROP INDEX IF EXISTS "company_settings_logo_file_id_idx";

ALTER TABLE "company_settings" RENAME TO "owner_profiles";

ALTER TABLE "owner_profiles" RENAME COLUMN "name" TO "full_name";

ALTER TABLE "owner_profiles"
  DROP COLUMN IF EXISTS "trade_name",
  DROP COLUMN IF EXISTS "legal_name",
  DROP COLUMN IF EXISTS "document_number",
  DROP COLUMN IF EXISTS "website",
  DROP COLUMN IF EXISTS "address",
  DROP COLUMN IF EXISTS "city",
  DROP COLUMN IF EXISTS "region",
  DROP COLUMN IF EXISTS "country",
  DROP COLUMN IF EXISTS "logo_url",
  DROP COLUMN IF EXISTS "logo_file_id",
  DROP COLUMN IF EXISTS "description",
  DROP COLUMN IF EXISTS "slogan",
  DROP COLUMN IF EXISTS "footer_text",
  DROP COLUMN IF EXISTS "metadata";

ALTER TABLE "owner_profiles"
  ALTER COLUMN "full_name" SET DEFAULT '';

UPDATE "owner_profiles"
SET "full_name" = ''
WHERE "full_name" IS NULL;

ALTER TABLE "owner_profiles"
  ALTER COLUMN "full_name" SET NOT NULL;

ALTER TYPE "AuditEntityType" ADD VALUE IF NOT EXISTS 'OWNER_PROFILE';

UPDATE "permissions"
SET
  "key" = 'owner.read',
  "name" = 'owner read',
  "metadata" = jsonb_set(COALESCE("metadata", '{}'::jsonb), '{group}', '"owner"'::jsonb),
  "updated_at" = CURRENT_TIMESTAMP
WHERE "key" = 'company.read'
  AND NOT EXISTS (SELECT 1 FROM "permissions" WHERE "key" = 'owner.read');

UPDATE "permissions"
SET
  "key" = 'owner.update',
  "name" = 'owner update',
  "metadata" = jsonb_set(COALESCE("metadata", '{}'::jsonb), '{group}', '"owner"'::jsonb),
  "updated_at" = CURRENT_TIMESTAMP
WHERE "key" = 'company.update'
  AND NOT EXISTS (SELECT 1 FROM "permissions" WHERE "key" = 'owner.update');

INSERT INTO "permissions" ("id", "key", "name", "metadata", "created_at", "updated_at")
VALUES
  ('00000000-0000-4000-8000-000000000301', 'owner.read', 'owner read', '{"group":"owner"}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000000302', 'owner.update', 'owner update', '{"group":"owner"}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

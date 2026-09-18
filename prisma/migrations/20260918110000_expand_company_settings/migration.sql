ALTER TABLE "company_settings"
  ADD COLUMN IF NOT EXISTS "trade_name" TEXT,
  ADD COLUMN IF NOT EXISTS "website" TEXT,
  ADD COLUMN IF NOT EXISTS "city" TEXT,
  ADD COLUMN IF NOT EXISTS "region" TEXT,
  ADD COLUMN IF NOT EXISTS "country" TEXT DEFAULT 'Peru',
  ADD COLUMN IF NOT EXISTS "logo_file_id" UUID,
  ADD COLUMN IF NOT EXISTS "description" TEXT,
  ADD COLUMN IF NOT EXISTS "slogan" TEXT,
  ADD COLUMN IF NOT EXISTS "footer_text" TEXT;

UPDATE "company_settings"
SET "country" = COALESCE("country", 'Peru')
WHERE "id" = 'global';

CREATE INDEX IF NOT EXISTS "company_settings_logo_file_id_idx" ON "company_settings"("logo_file_id");

ALTER TABLE "company_settings"
  DROP CONSTRAINT IF EXISTS "company_settings_logo_file_id_fkey";

ALTER TABLE "company_settings"
  ADD CONSTRAINT "company_settings_logo_file_id_fkey"
  FOREIGN KEY ("logo_file_id") REFERENCES "stored_files"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

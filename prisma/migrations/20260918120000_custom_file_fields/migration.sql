CREATE TYPE "FileFieldSource" AS ENUM ('SYSTEM', 'CUSTOM');

CREATE TABLE "file_fields" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "key" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "description" TEXT,
  "required" BOOLEAN NOT NULL DEFAULT false,
  "accepted_mime_types" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "max_files" INTEGER NOT NULL DEFAULT 1,
  "max_file_size" INTEGER NOT NULL DEFAULT 10485760,
  "source" "FileFieldSource" NOT NULL DEFAULT 'CUSTOM',
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "file_fields_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "file_fields_key_key" ON "file_fields"("key");
CREATE INDEX "file_fields_source_idx" ON "file_fields"("source");
CREATE INDEX "file_fields_is_active_idx" ON "file_fields"("is_active");
CREATE INDEX "file_fields_sort_order_idx" ON "file_fields"("sort_order");

ALTER TABLE "template_elements" ADD COLUMN "file_field_id" UUID;
ALTER TABLE "stored_files" ADD COLUMN "file_field_id" UUID;

CREATE INDEX "template_elements_file_field_id_idx" ON "template_elements"("file_field_id");
CREATE INDEX "stored_files_file_field_id_idx" ON "stored_files"("file_field_id");

ALTER TABLE "template_elements"
  ADD CONSTRAINT "template_elements_file_field_id_fkey"
  FOREIGN KEY ("file_field_id") REFERENCES "file_fields"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "stored_files"
  ADD CONSTRAINT "stored_files_file_field_id_fkey"
  FOREIGN KEY ("file_field_id") REFERENCES "file_fields"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TYPE "AuditEntityType" ADD VALUE IF NOT EXISTS 'FILE_FIELD';

INSERT INTO "file_fields" ("id", "key", "label", "description", "required", "accepted_mime_types", "max_files", "max_file_size", "source", "is_active", "sort_order", "updated_at")
VALUES
  ('00000000-0000-4000-8000-000000000201', 'foto_principal', 'Foto principal', 'Campo precargado para imagenes del documento.', true, ARRAY['image/jpeg','image/png','image/webp'], 1, 10485760, 'SYSTEM', true, 10, CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000000202', 'documento_principal', 'Documento principal', 'Campo precargado para PDF, DOC o DOCX.', false, ARRAY['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document'], 1, 10485760, 'SYSTEM', true, 20, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

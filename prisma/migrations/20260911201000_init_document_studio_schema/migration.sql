-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "TemplateStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PaperSize" AS ENUM ('A4', 'A5', 'LETTER', 'LEGAL', 'CUSTOM');

-- CreateEnum
CREATE TYPE "Orientation" AS ENUM ('PORTRAIT', 'LANDSCAPE');

-- CreateEnum
CREATE TYPE "TemplateElementType" AS ENUM ('IMAGE', 'TEXT', 'RECTANGLE', 'LINE', 'QR_CODE', 'BARCODE', 'SIGNATURE', 'DATE', 'PAGE_NUMBER', 'LOGO');

-- CreateEnum
CREATE TYPE "StoredFileType" AS ENUM ('IMAGE', 'PDF');

-- CreateEnum
CREATE TYPE "GenerationStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'DOWNLOAD', 'GENERATE', 'LOGIN');

-- CreateEnum
CREATE TYPE "AuditEntityType" AS ENUM ('USER', 'TEMPLATE', 'TEMPLATE_VERSION', 'TEMPLATE_ELEMENT', 'GENERATION', 'GENERATION_INPUT', 'STORED_FILE');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "auth_provider_id" TEXT,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "avatar_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "last_login_at" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "templates" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "TemplateStatus" NOT NULL DEFAULT 'DRAFT',
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "template_versions" (
    "id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "paper_size" "PaperSize" NOT NULL,
    "orientation" "Orientation" NOT NULL,
    "width" DECIMAL(10,3) NOT NULL,
    "height" DECIMAL(10,3) NOT NULL,
    "margin_top" DECIMAL(10,3) NOT NULL DEFAULT 0,
    "margin_right" DECIMAL(10,3) NOT NULL DEFAULT 0,
    "margin_bottom" DECIMAL(10,3) NOT NULL DEFAULT 0,
    "margin_left" DECIMAL(10,3) NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "template_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "template_elements" (
    "id" UUID NOT NULL,
    "template_version_id" UUID NOT NULL,
    "type" "TemplateElementType" NOT NULL,
    "name" TEXT NOT NULL,
    "key" TEXT,
    "page" INTEGER NOT NULL,
    "x" DECIMAL(10,3) NOT NULL,
    "y" DECIMAL(10,3) NOT NULL,
    "width" DECIMAL(10,3) NOT NULL,
    "height" DECIMAL(10,3) NOT NULL,
    "rotation" DECIMAL(7,3) NOT NULL DEFAULT 0,
    "z_index" INTEGER NOT NULL DEFAULT 0,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "properties" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "template_elements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stored_files" (
    "id" UUID NOT NULL,
    "original_name" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "type" "StoredFileType" NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "checksum" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stored_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "generations" (
    "id" UUID NOT NULL,
    "sequence_number" INTEGER NOT NULL,
    "number" TEXT NOT NULL,
    "template_id" UUID NOT NULL,
    "template_version_id" UUID NOT NULL,
    "created_by_id" UUID NOT NULL,
    "output_file_id" UUID,
    "status" "GenerationStatus" NOT NULL DEFAULT 'PENDING',
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "generations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "generation_inputs" (
    "id" UUID NOT NULL,
    "generation_id" UUID NOT NULL,
    "template_element_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB,
    "file_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "generation_inputs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "action" "AuditAction" NOT NULL,
    "entity_type" "AuditEntityType" NOT NULL,
    "entity_id" UUID,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "generation_counters" (
    "key" TEXT NOT NULL,
    "prefix" TEXT NOT NULL DEFAULT 'GGS',
    "padding" INTEGER NOT NULL DEFAULT 6,
    "current_value" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "generation_counters_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_auth_provider_id_key" ON "users"("auth_provider_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_auth_provider_id_idx" ON "users"("auth_provider_id");

-- CreateIndex
CREATE INDEX "templates_created_by_id_idx" ON "templates"("created_by_id");

-- CreateIndex
CREATE INDEX "templates_status_idx" ON "templates"("status");

-- CreateIndex
CREATE INDEX "templates_created_at_idx" ON "templates"("created_at");

-- CreateIndex
CREATE INDEX "template_versions_template_id_idx" ON "template_versions"("template_id");

-- CreateIndex
CREATE INDEX "template_versions_template_id_is_active_idx" ON "template_versions"("template_id", "is_active");

-- CreateIndex
CREATE INDEX "template_versions_is_active_idx" ON "template_versions"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "template_versions_one_active_per_template_idx" ON "template_versions"("template_id") WHERE "is_active" = true;

-- CreateIndex
CREATE UNIQUE INDEX "template_versions_template_id_version_number_key" ON "template_versions"("template_id", "version_number");

-- CreateIndex
CREATE INDEX "template_elements_template_version_id_idx" ON "template_elements"("template_version_id");

-- CreateIndex
CREATE INDEX "template_elements_template_version_id_type_idx" ON "template_elements"("template_version_id", "type");

-- CreateIndex
CREATE INDEX "template_elements_key_idx" ON "template_elements"("key");

-- CreateIndex
CREATE INDEX "template_elements_type_idx" ON "template_elements"("type");

-- CreateIndex
CREATE UNIQUE INDEX "template_elements_template_version_id_key_key" ON "template_elements"("template_version_id", "key");

-- CreateIndex
CREATE UNIQUE INDEX "stored_files_storage_key_key" ON "stored_files"("storage_key");

-- CreateIndex
CREATE INDEX "stored_files_created_by_id_idx" ON "stored_files"("created_by_id");

-- CreateIndex
CREATE INDEX "stored_files_type_idx" ON "stored_files"("type");

-- CreateIndex
CREATE INDEX "stored_files_created_at_idx" ON "stored_files"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "generations_sequence_number_key" ON "generations"("sequence_number");

-- CreateIndex
CREATE UNIQUE INDEX "generations_number_key" ON "generations"("number");

-- CreateIndex
CREATE UNIQUE INDEX "generations_output_file_id_key" ON "generations"("output_file_id");

-- CreateIndex
CREATE INDEX "generations_template_id_idx" ON "generations"("template_id");

-- CreateIndex
CREATE INDEX "generations_template_version_id_idx" ON "generations"("template_version_id");

-- CreateIndex
CREATE INDEX "generations_created_by_id_idx" ON "generations"("created_by_id");

-- CreateIndex
CREATE INDEX "generations_status_idx" ON "generations"("status");

-- CreateIndex
CREATE INDEX "generations_created_at_idx" ON "generations"("created_at");

-- CreateIndex
CREATE INDEX "generation_inputs_generation_id_idx" ON "generation_inputs"("generation_id");

-- CreateIndex
CREATE INDEX "generation_inputs_template_element_id_idx" ON "generation_inputs"("template_element_id");

-- CreateIndex
CREATE INDEX "generation_inputs_file_id_idx" ON "generation_inputs"("file_id");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs"("user_id");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- AddForeignKey
ALTER TABLE "templates" ADD CONSTRAINT "templates_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_versions" ADD CONSTRAINT "template_versions_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_elements" ADD CONSTRAINT "template_elements_template_version_id_fkey" FOREIGN KEY ("template_version_id") REFERENCES "template_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generations" ADD CONSTRAINT "generations_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generations" ADD CONSTRAINT "generations_template_version_id_fkey" FOREIGN KEY ("template_version_id") REFERENCES "template_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generations" ADD CONSTRAINT "generations_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generations" ADD CONSTRAINT "generations_output_file_id_fkey" FOREIGN KEY ("output_file_id") REFERENCES "stored_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generation_inputs" ADD CONSTRAINT "generation_inputs_generation_id_fkey" FOREIGN KEY ("generation_id") REFERENCES "generations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generation_inputs" ADD CONSTRAINT "generation_inputs_template_element_id_fkey" FOREIGN KEY ("template_element_id") REFERENCES "template_elements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generation_inputs" ADD CONSTRAINT "generation_inputs_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "stored_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddCheckConstraint
ALTER TABLE "template_versions" ADD CONSTRAINT "template_versions_positive_size_chk" CHECK ("width" > 0 AND "height" > 0);

-- AddCheckConstraint
ALTER TABLE "template_versions" ADD CONSTRAINT "template_versions_non_negative_margins_chk" CHECK ("margin_top" >= 0 AND "margin_right" >= 0 AND "margin_bottom" >= 0 AND "margin_left" >= 0);

-- AddCheckConstraint
ALTER TABLE "template_elements" ADD CONSTRAINT "template_elements_positive_page_chk" CHECK ("page" > 0);

-- AddCheckConstraint
ALTER TABLE "template_elements" ADD CONSTRAINT "template_elements_non_negative_geometry_chk" CHECK ("x" >= 0 AND "y" >= 0 AND "width" >= 0 AND "height" >= 0);

-- AddCheckConstraint
ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_non_negative_size_chk" CHECK ("size_bytes" >= 0);

-- AddCheckConstraint
ALTER TABLE "generations" ADD CONSTRAINT "generations_positive_sequence_chk" CHECK ("sequence_number" > 0);

-- AddCheckConstraint
ALTER TABLE "generation_counters" ADD CONSTRAINT "generation_counters_valid_values_chk" CHECK ("padding" > 0 AND "current_value" >= 0);

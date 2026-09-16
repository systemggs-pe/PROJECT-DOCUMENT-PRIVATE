ALTER TYPE "StoredFileType" ADD VALUE IF NOT EXISTS 'DOCUMENT';

CREATE TABLE "generation_attachments" (
    "id" UUID NOT NULL,
    "generation_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "order" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "generation_attachments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "generation_attachments_generation_id_file_id_key" ON "generation_attachments"("generation_id", "file_id");
CREATE UNIQUE INDEX "generation_attachments_generation_id_order_key" ON "generation_attachments"("generation_id", "order");
CREATE INDEX "generation_attachments_generation_id_idx" ON "generation_attachments"("generation_id");
CREATE INDEX "generation_attachments_file_id_idx" ON "generation_attachments"("file_id");

ALTER TABLE "generation_attachments" ADD CONSTRAINT "generation_attachments_generation_id_fkey" FOREIGN KEY ("generation_id") REFERENCES "generations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "generation_attachments" ADD CONSTRAINT "generation_attachments_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "stored_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

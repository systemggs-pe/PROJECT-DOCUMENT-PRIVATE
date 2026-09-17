ALTER TABLE "generation_attachments" ADD COLUMN "display_name" TEXT;
ALTER TABLE "generation_attachments" ADD COLUMN "include_in_generation" BOOLEAN NOT NULL DEFAULT true;

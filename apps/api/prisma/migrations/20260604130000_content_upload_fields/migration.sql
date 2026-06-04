ALTER TABLE "contents" ADD COLUMN "mime_type" TEXT;
ALTER TABLE "contents" ADD COLUMN "upload_status" TEXT NOT NULL DEFAULT 'none';

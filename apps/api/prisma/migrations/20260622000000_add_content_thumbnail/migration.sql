ALTER TABLE "contents" ADD COLUMN "thumbnail_path" TEXT;
ALTER TABLE "contents" ADD COLUMN "thumbnail_mime_type" TEXT;
ALTER TABLE "contents" ADD COLUMN "thumbnail_status" TEXT NOT NULL DEFAULT 'none';

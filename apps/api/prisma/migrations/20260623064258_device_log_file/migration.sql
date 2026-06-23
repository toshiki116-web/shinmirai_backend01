/*
  Warnings:

  - You are about to drop the `device_logs` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "device_logs" DROP CONSTRAINT "device_logs_unit_id_fkey";

-- AlterTable
ALTER TABLE "contents" ALTER COLUMN "content_id" SET DEFAULT concat('CNT-', lpad(cast(nextval('content_id_seq') as text), 5, '0'));

-- AlterTable
ALTER TABLE "sites" ALTER COLUMN "site_id" SET DEFAULT concat('LOC-', lpad(cast(nextval('site_id_seq') as text), 4, '0'));

-- AlterTable
ALTER TABLE "units" ALTER COLUMN "unit_id" SET DEFAULT concat('UNIT-', upper(substring(gen_random_uuid()::text, 1, 8)));

-- DropTable
DROP TABLE "device_logs";

-- CreateTable
CREATE TABLE "device_log_files" (
    "log_file_id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "s3_key" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "content_type" TEXT,
    "checksum" TEXT,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_log_files_pkey" PRIMARY KEY ("log_file_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "device_log_files_s3_key_key" ON "device_log_files"("s3_key");

-- CreateIndex
CREATE INDEX "device_log_files_unit_id_uploaded_at_idx" ON "device_log_files"("unit_id", "uploaded_at");

-- AddForeignKey
ALTER TABLE "device_log_files" ADD CONSTRAINT "device_log_files_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("unit_id") ON DELETE RESTRICT ON UPDATE CASCADE;

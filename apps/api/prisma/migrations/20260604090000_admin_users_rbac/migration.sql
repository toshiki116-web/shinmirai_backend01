-- Add RBAC/user-management fields while preserving existing admins.
ALTER TABLE "admins" ADD COLUMN "email" TEXT;
ALTER TABLE "admins" ADD COLUMN "role" TEXT NOT NULL DEFAULT 'viewer';
ALTER TABLE "admins" ADD COLUMN "note" TEXT;
ALTER TABLE "admins" ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "admins" ALTER COLUMN "login_id" DROP NOT NULL;

-- Backfill the current production bootstrap admin as the first master.
UPDATE "admins"
SET
  "email" = 'kushida@artifice-inc.com',
  "role" = 'master',
  "is_active" = true
WHERE "login_id" = 'sinmirai-admin';

-- Local/dev fallback for any other existing admin rows.
UPDATE "admins"
SET "email" = COALESCE("login_id", "id") || '@local.sinmirai.invalid'
WHERE "email" IS NULL;

ALTER TABLE "admins" ALTER COLUMN "email" SET NOT NULL;

CREATE UNIQUE INDEX "admins_email_key" ON "admins"("email");

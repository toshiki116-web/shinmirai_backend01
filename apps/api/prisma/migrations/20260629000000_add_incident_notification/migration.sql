ALTER TABLE "admins" ADD COLUMN "notify_on_incident" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "units" ADD COLUMN "last_incident_notified_at" TIMESTAMP(3);

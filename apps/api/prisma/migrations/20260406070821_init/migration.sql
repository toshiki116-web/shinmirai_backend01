-- シーケンス作成（拠点ID・コンテンツIDの自動採番用）
CREATE SEQUENCE site_id_seq START 1;
CREATE SEQUENCE content_id_seq START 1;

-- CreateTable
CREATE TABLE "admins" (
    "id" TEXT NOT NULL,
    "login_id" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sites" (
    "site_id" TEXT NOT NULL DEFAULT concat('LOC-', lpad(cast(nextval('site_id_seq') as text), 4, '0')),
    "site_name" TEXT NOT NULL,
    "address" TEXT,
    "phone_number" TEXT,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sites_pkey" PRIMARY KEY ("site_id")
);

-- CreateTable
CREATE TABLE "units" (
    "unit_id" TEXT NOT NULL DEFAULT concat('UNIT-', upper(substring(gen_random_uuid()::text, 1, 8))),
    "site_id" TEXT,
    "unit_name" TEXT NOT NULL,
    "pc_uuid" TEXT,
    "device_token" TEXT,
    "connection_mode" TEXT NOT NULL DEFAULT 'online',
    "status" TEXT NOT NULL DEFAULT 'normal',
    "alert_message" TEXT,
    "license_status" TEXT NOT NULL DEFAULT 'unknown',
    "license_expired_at" TIMESTAMP(3),
    "last_seen_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "units_pkey" PRIMARY KEY ("unit_id")
);

-- CreateTable
CREATE TABLE "contents" (
    "content_id" TEXT NOT NULL DEFAULT concat('CNT-', lpad(cast(nextval('content_id_seq') as text), 5, '0')),
    "content_name" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'ja',
    "delivery_type" TEXT NOT NULL DEFAULT 'general',
    "status_category" TEXT NOT NULL DEFAULT 'status1',
    "file_path" TEXT,
    "file_size" BIGINT,
    "checksum" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contents_pkey" PRIMARY KEY ("content_id")
);

-- CreateTable
CREATE TABLE "content_site_assignments" (
    "content_id" TEXT NOT NULL,
    "site_id" TEXT NOT NULL,

    CONSTRAINT "content_site_assignments_pkey" PRIMARY KEY ("content_id","site_id")
);

-- CreateTable
CREATE TABLE "device_logs" (
    "log_id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "log_type" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_logs_pkey" PRIMARY KEY ("log_id")
);

-- CreateTable
CREATE TABLE "device_alerts" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "alert_type" TEXT NOT NULL,
    "device_name" TEXT,
    "detail" TEXT,
    "level" TEXT NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_analytics" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "target_date" DATE NOT NULL,
    "use_count" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_analytics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "admins_login_id_key" ON "admins"("login_id");

-- CreateIndex
CREATE UNIQUE INDEX "units_device_token_key" ON "units"("device_token");

-- CreateIndex
CREATE INDEX "device_logs_unit_id_occurred_at_idx" ON "device_logs"("unit_id", "occurred_at");

-- CreateIndex
CREATE INDEX "device_alerts_unit_id_occurred_at_idx" ON "device_alerts"("unit_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "daily_analytics_unit_id_target_date_key" ON "daily_analytics"("unit_id", "target_date");

-- AddForeignKey
ALTER TABLE "units" ADD CONSTRAINT "units_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("site_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_site_assignments" ADD CONSTRAINT "content_site_assignments_content_id_fkey" FOREIGN KEY ("content_id") REFERENCES "contents"("content_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_site_assignments" ADD CONSTRAINT "content_site_assignments_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("site_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_logs" ADD CONSTRAINT "device_logs_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("unit_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_alerts" ADD CONSTRAINT "device_alerts_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("unit_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_analytics" ADD CONSTRAINT "daily_analytics_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("unit_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "contents" ALTER COLUMN "content_id" SET DEFAULT concat('CNT-', lpad(cast(nextval('content_id_seq') as text), 5, '0'));

-- AlterTable
ALTER TABLE "sites" ALTER COLUMN "site_id" SET DEFAULT concat('LOC-', lpad(cast(nextval('site_id_seq') as text), 4, '0'));

-- AlterTable
ALTER TABLE "units" ALTER COLUMN "unit_id" SET DEFAULT concat('UNIT-', upper(substring(gen_random_uuid()::text, 1, 8)));

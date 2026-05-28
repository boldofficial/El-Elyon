ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "status" varchar(20) DEFAULT 'active' NOT NULL;
ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "inactive_reason" varchar(50);

CREATE TABLE IF NOT EXISTS "admin_privileges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_user_id" varchar(255) NOT NULL,
	"privilege" varchar(100) NOT NULL,
	"granted_by" varchar(255) NOT NULL,
	"granted_at" timestamp DEFAULT now() NOT NULL,
	"revoked_by" varchar(255),
	"revoked_at" timestamp
);

CREATE INDEX IF NOT EXISTS "admin_privileges_clerk_user_id_idx"
	ON "admin_privileges" ("clerk_user_id");

CREATE INDEX IF NOT EXISTS "admin_privileges_active_idx"
	ON "admin_privileges" ("clerk_user_id", "privilege")
	WHERE "revoked_at" IS NULL;

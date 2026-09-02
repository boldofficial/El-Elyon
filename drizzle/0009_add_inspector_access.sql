-- Inspector Access: one-time-password grants for read-only state-inspector
-- access to a location's compliance data (no Clerk account required).

CREATE TABLE IF NOT EXISTS "inspector_access" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"location" varchar(255) NOT NULL,
	"label" varchar(255),
	"otp_hash" varchar(255) NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_by" varchar(255) NOT NULL,
	"created_by_name" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"revoked_at" timestamp,
	"revoked_by" varchar(255),
	"last_accessed_at" timestamp
);

CREATE INDEX IF NOT EXISTS "inspector_access_otp_hash_idx"
	ON "inspector_access" ("otp_hash");

CREATE INDEX IF NOT EXISTS "inspector_access_location_idx"
	ON "inspector_access" ("location");

CREATE INDEX IF NOT EXISTS "inspector_access_expires_at_idx"
	ON "inspector_access" ("expires_at");

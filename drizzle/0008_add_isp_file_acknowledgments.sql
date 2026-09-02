-- ISP File Acknowledgments: read receipts for uploaded ISP files.
-- Tied to isp_files (the upload system), separate from the legacy
-- isp_acknowledgments table which references the `isp` content records.

CREATE TABLE IF NOT EXISTS "isp_file_acknowledgments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"isp_file_id" uuid NOT NULL,
	"resident_id" uuid NOT NULL,
	"clerk_user_id" varchar(255) NOT NULL,
	"acknowledged_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "isp_file_acknowledgments_isp_file_id_isp_files_id_fk"
		FOREIGN KEY ("isp_file_id") REFERENCES "isp_files"("id") ON DELETE cascade,
	CONSTRAINT "isp_file_acknowledgments_resident_id_residents_id_fk"
		FOREIGN KEY ("resident_id") REFERENCES "residents"("id") ON DELETE cascade
);

CREATE UNIQUE INDEX IF NOT EXISTS "isp_file_ack_file_user_idx"
	ON "isp_file_acknowledgments" ("isp_file_id", "clerk_user_id");

CREATE INDEX IF NOT EXISTS "isp_file_ack_user_idx"
	ON "isp_file_acknowledgments" ("clerk_user_id");

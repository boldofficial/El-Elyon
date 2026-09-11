CREATE TABLE "isp_signature_packets" (
 "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
 "resident_id" uuid NOT NULL,
 "resident_name" varchar(255) NOT NULL,
 "draft" jsonb NOT NULL,
 "state" varchar(30) DEFAULT 'draft' NOT NULL,
 "revision" integer DEFAULT 1 NOT NULL,
 "provider_id" varchar(255),
 "provider_origin" varchar(500),
 "original_key" text,
 "original_sha256" varchar(64),
 "signed_key" text,
 "audit_key" text,
 "signer_statuses" jsonb DEFAULT '[]'::jsonb NOT NULL,
 "created_by" varchar(255) NOT NULL,
 "created_at" timestamp DEFAULT now() NOT NULL,
 "updated_at" timestamp DEFAULT now() NOT NULL,
 "last_synced_at" timestamp,
 "last_reminder_at" timestamp,
 "lock_token" uuid,
 "locked_until" timestamp,
 CONSTRAINT "isp_signature_packets_state_check" CHECK ("state" IN ('draft','preparing','ready','sending','pending','completed','rejected','cancelled')),
 CONSTRAINT "isp_signature_packets_resident_id_residents_id_fk" FOREIGN KEY ("resident_id") REFERENCES "residents"("id") ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE INDEX "isp_signature_packets_resident_idx" ON "isp_signature_packets" ("resident_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "isp_signature_packets_provider_idx" ON "isp_signature_packets" ("provider_origin", "provider_id");

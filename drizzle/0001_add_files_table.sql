CREATE TABLE "files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"content_type" varchar(100) NOT NULL,
	"file_size" integer NOT NULL,
	"file_content" text NOT NULL,
	"category" varchar(50) NOT NULL,
	"uploaded_by" varchar(255) NOT NULL,
	"uploaded_at" timestamp DEFAULT now() NOT NULL,
	"metadata" jsonb
);
--> statement-breakpoint
ALTER TABLE "fire_evac" ADD COLUMN "file_id" uuid;--> statement-breakpoint
ALTER TABLE "hr_files" ADD COLUMN "file_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "isp_files" ADD COLUMN "file_id" uuid NOT NULL;--> statement-breakpoint
CREATE INDEX "files_category_idx" ON "files" USING btree ("category");--> statement-breakpoint
CREATE INDEX "files_uploaded_by_idx" ON "files" USING btree ("uploaded_by");--> statement-breakpoint
CREATE INDEX "files_uploaded_at_idx" ON "files" USING btree ("uploaded_at");--> statement-breakpoint
ALTER TABLE "fire_evac" ADD CONSTRAINT "fire_evac_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_files" ADD CONSTRAINT "hr_files_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "isp_files" ADD CONSTRAINT "isp_files_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fire_evac_file_id_idx" ON "fire_evac" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "hr_files_file_id_idx" ON "hr_files" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "isp_files_file_id_idx" ON "isp_files" USING btree ("file_id");--> statement-breakpoint
ALTER TABLE "fire_evac" DROP COLUMN "file_storage_id";--> statement-breakpoint
ALTER TABLE "hr_files" DROP COLUMN "file_storage_id";--> statement-breakpoint
ALTER TABLE "isp_files" DROP COLUMN "file_storage_id";
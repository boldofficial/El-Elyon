CREATE TABLE "staff_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category" varchar(50) NOT NULL,
	"employee_id" uuid,
	"location" varchar(255),
	"title" varchar(255) NOT NULL,
	"notes" text,
	"file_storage_id" varchar(500) NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"file_size" integer NOT NULL,
	"content_type" varchar(100) NOT NULL,
	"uploaded_by" varchar(255) NOT NULL,
	"uploaded_at" timestamp DEFAULT now() NOT NULL,
	"archived_at" timestamp,
	"archived_by" varchar(255),
	CONSTRAINT "staff_documents_filed_under_one_check" CHECK (("staff_documents"."employee_id" IS NULL) <> ("staff_documents"."location" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "staff_documents" ADD CONSTRAINT "staff_documents_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "staff_documents_employee_id_idx" ON "staff_documents" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "staff_documents_location_idx" ON "staff_documents" USING btree ("location");--> statement-breakpoint
CREATE INDEX "staff_documents_category_idx" ON "staff_documents" USING btree ("category");
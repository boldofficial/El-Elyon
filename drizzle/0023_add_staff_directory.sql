CREATE TABLE "staff_roster_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"location" varchar(255) NOT NULL,
	"employee_id" uuid NOT NULL,
	"title" varchar(255),
	"roster_hire_date" date,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" varchar(255) NOT NULL,
	"updated_at" timestamp,
	"updated_by" varchar(255)
);
--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "date_of_birth" date;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "sex" varchar(20);--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "home_address" text;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "emergency_contact_name" varchar(255);--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "emergency_contact_phone" varchar(50);--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "emergency_contact_relationship" varchar(100);--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "profile_notes" text;--> statement-breakpoint
ALTER TABLE "staff_roster_entries" ADD CONSTRAINT "staff_roster_entries_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "staff_roster_entries_location_idx" ON "staff_roster_entries" USING btree ("location");--> statement-breakpoint
CREATE INDEX "staff_roster_entries_employee_id_idx" ON "staff_roster_entries" USING btree ("employee_id");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_roster_entries_location_employee_uidx" ON "staff_roster_entries" USING btree ("location","employee_id");
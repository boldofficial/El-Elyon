CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" varchar(40) NOT NULL,
	"title" varchar(200) NOT NULL,
	"description" text,
	"location" varchar(255) NOT NULL,
	"resident_id" uuid,
	"assigned_staff_id" varchar(255),
	"assigned_name_snapshot" varchar(255),
	"visibility" varchar(20) DEFAULT 'home' NOT NULL,
	"due_date" date NOT NULL,
	"due_time" varchar(5),
	"status" varchar(20) DEFAULT 'open' NOT NULL,
	"created_by" varchar(255) NOT NULL,
	"created_by_name_snapshot" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp,
	"updated_by" varchar(255),
	"completed_at" timestamp,
	"completed_by" varchar(255),
	"completed_by_name_snapshot" varchar(255),
	"completion_note" text,
	"cancelled_at" timestamp,
	"cancelled_by" varchar(255),
	"cancelled_by_name_snapshot" varchar(255),
	CONSTRAINT "tasks_visibility_check" CHECK ("tasks"."visibility" in ('home', 'assignee', 'supervisors')),
	CONSTRAINT "tasks_status_check" CHECK ("tasks"."status" in ('open', 'done', 'cancelled')),
	CONSTRAINT "tasks_assignee_visibility_check" CHECK ("tasks"."visibility" <> 'assignee' or "tasks"."assigned_staff_id" is not null)
);
--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_resident_id_residents_id_fk" FOREIGN KEY ("resident_id") REFERENCES "public"."residents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tasks_location_status_due_idx" ON "tasks" USING btree ("location","status","due_date");--> statement-breakpoint
CREATE INDEX "tasks_assignee_status_idx" ON "tasks" USING btree ("assigned_staff_id","status");--> statement-breakpoint
CREATE INDEX "tasks_resident_idx" ON "tasks" USING btree ("resident_id");
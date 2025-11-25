CREATE TABLE "el_elyon_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_user_id" varchar(255),
	"event" varchar(255) NOT NULL,
	"timestamp" timestamp NOT NULL,
	"device_id" varchar(255) NOT NULL,
	"location" varchar(255) NOT NULL,
	"details" text
);
--> statement-breakpoint
CREATE TABLE "el_elyon_compliance_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" varchar(50) NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text NOT NULL,
	"location" varchar(255) NOT NULL,
	"status" varchar(50) NOT NULL,
	"severity" varchar(50) NOT NULL,
	"active" boolean NOT NULL,
	"created_at" timestamp NOT NULL,
	"dismissed_by" varchar(255),
	"dismissed_at" timestamp,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "el_elyon_compliance_reminder_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"type" varchar(50) NOT NULL,
	"subject" varchar(500) NOT NULL,
	"body" text NOT NULL,
	"days_before_due" integer NOT NULL,
	"active" boolean NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "el_elyon_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"compliance_reminder_template" text,
	"guardian_invite_template" text,
	"alert_weekday" integer,
	"alert_hour" integer,
	"alert_minute" integer,
	"selfie_enforced" boolean
);
--> statement-breakpoint
CREATE TABLE "el_elyon_devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_id" varchar(255) NOT NULL,
	"device_name" varchar(255) NOT NULL,
	"location" varchar(255) NOT NULL,
	"is_active" boolean NOT NULL,
	"device_type" varchar(50),
	"registered_by" varchar(255) NOT NULL,
	"registered_at" timestamp NOT NULL,
	"last_used_at" timestamp,
	"last_used_by" varchar(255),
	"metadata" jsonb,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "el_elyon_employees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" varchar(255),
	"name" varchar(255) NOT NULL,
	"email" varchar(255),
	"work_email" varchar(255) NOT NULL,
	"phone" varchar(50),
	"role" varchar(50),
	"locations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"employment_status" varchar(100),
	"created_at" timestamp DEFAULT now(),
	"created_by" varchar(255),
	"updated_at" timestamp,
	"clerk_user_id" varchar(255),
	"assigned_device_id" varchar(255),
	"invited_at" timestamp,
	"invited_by" varchar(255),
	"has_accepted_invite" boolean,
	"invite_token" varchar(255),
	"invite_expires_at" timestamp,
	"onboarded_by" varchar(255),
	"onboarded_at" timestamp,
	"invite_bounced" boolean,
	"invite_resent" integer
);
--> statement-breakpoint
CREATE TABLE "el_elyon_fire_evac" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"resident_id" uuid NOT NULL,
	"location" varchar(255),
	"version" integer NOT NULL,
	"mobility_needs" text,
	"assistance_required" text,
	"medical_equipment" text,
	"special_instructions" text,
	"created_at" timestamp DEFAULT now(),
	"created_by" varchar(255),
	"file_storage_id" varchar(255),
	"file_name" varchar(255),
	"file_size" integer,
	"content_type" varchar(100),
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "el_elyon_guardian_checklist_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"resident_id" uuid NOT NULL,
	"template_id" uuid NOT NULL,
	"guardian_email" varchar(255) NOT NULL,
	"token" varchar(255) NOT NULL,
	"sent_date" timestamp NOT NULL,
	"sent_by" varchar(255),
	"expires_at" timestamp NOT NULL,
	"completed" boolean NOT NULL,
	"completed_at" timestamp,
	"responses" jsonb
);
--> statement-breakpoint
CREATE TABLE "el_elyon_guardian_checklist_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"questions" jsonb NOT NULL,
	"created_by" varchar(255) NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp,
	"updated_by" varchar(255),
	"active" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "el_elyon_guardians" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"relationship" varchar(100),
	"phone" varchar(50) NOT NULL,
	"email" varchar(255) NOT NULL,
	"address" text,
	"resident_ids" jsonb,
	"created_at" timestamp DEFAULT now(),
	"created_by" varchar(255)
);
--> statement-breakpoint
CREATE TABLE "el_elyon_hr_file_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_user_id" varchar(255),
	"hr_file_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"action" varchar(50) NOT NULL,
	"timestamp" timestamp NOT NULL,
	"success" boolean NOT NULL,
	"error_message" text
);
--> statement-breakpoint
CREATE TABLE "el_elyon_hr_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"file_storage_id" varchar(255) NOT NULL,
	"file_size" integer NOT NULL,
	"content_type" varchar(100) NOT NULL,
	"uploaded_by" varchar(255) NOT NULL,
	"uploaded_at" timestamp NOT NULL,
	"archived_at" timestamp,
	"archived_by" varchar(255)
);
--> statement-breakpoint
CREATE TABLE "el_elyon_isp" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"resident_id" uuid NOT NULL,
	"published" boolean,
	"content" text,
	"goals" jsonb,
	"version" integer,
	"created_at" timestamp DEFAULT now(),
	"due_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "el_elyon_isp_access_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"isp_file_id" uuid NOT NULL,
	"resident_id" uuid NOT NULL,
	"clerk_user_id" varchar(255) NOT NULL,
	"action" varchar(50) NOT NULL,
	"timestamp" timestamp NOT NULL,
	"location" varchar(255) NOT NULL,
	"device_id" varchar(255) NOT NULL,
	"ip_address" varchar(100),
	"user_agent" text,
	"success" boolean NOT NULL,
	"error_message" text
);
--> statement-breakpoint
CREATE TABLE "el_elyon_isp_acknowledgments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"resident_id" uuid NOT NULL,
	"clerk_user_id" varchar(255) NOT NULL,
	"isp_id" uuid NOT NULL,
	"acknowledged_at" timestamp NOT NULL,
	"acknowledged_isp" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "el_elyon_isp_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"resident_id" uuid NOT NULL,
	"version_label" varchar(255) NOT NULL,
	"effective_date" timestamp NOT NULL,
	"status" varchar(50) NOT NULL,
	"file_storage_id" varchar(255) NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"file_size" integer NOT NULL,
	"content_type" varchar(100) NOT NULL,
	"prepared_by" varchar(255),
	"notes" text,
	"uploaded_by" varchar(255) NOT NULL,
	"uploaded_at" timestamp NOT NULL,
	"activated_by" varchar(255),
	"activated_at" timestamp,
	"archived_by" varchar(255),
	"archived_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "el_elyon_kiosk_pairing_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token" varchar(255) NOT NULL,
	"device_id" varchar(255) NOT NULL,
	"location" varchar(255) NOT NULL,
	"device_label" varchar(255),
	"status" varchar(50) NOT NULL,
	"issued_by" varchar(255) NOT NULL,
	"issued_at" timestamp NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "el_elyon_kiosks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255),
	"location" varchar(255) NOT NULL,
	"device_id" varchar(255) NOT NULL,
	"device_label" varchar(255),
	"status" varchar(50),
	"active" boolean,
	"last_heartbeat" timestamp,
	"last_seen_at" timestamp,
	"registered_at" timestamp,
	"registered_by" varchar(255),
	"created_at" timestamp DEFAULT now(),
	"created_by" varchar(255)
);
--> statement-breakpoint
CREATE TABLE "el_elyon_locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"address" text,
	"capacity" integer,
	"status" varchar(50),
	"created_by" varchar(255),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "el_elyon_resident_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"resident_id" uuid NOT NULL,
	"log_type" varchar(100),
	"content" text NOT NULL,
	"timestamp" timestamp,
	"created_by" varchar(255),
	"location" varchar(255),
	"shift_id" uuid,
	"author_id" varchar(255),
	"version" integer,
	"template" varchar(255),
	"created_at" timestamp DEFAULT now(),
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "el_elyon_residents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"date_of_birth" varchar(50),
	"dob" varchar(50),
	"location" varchar(255) NOT NULL,
	"guardian_ids" jsonb,
	"medical_info" text,
	"care_notes" text,
	"profile_image_id" varchar(255),
	"created_at" timestamp DEFAULT now(),
	"created_by" varchar(255)
);
--> statement-breakpoint
CREATE TABLE "el_elyon_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_user_id" varchar(255) NOT NULL,
	"role" varchar(50),
	"locations" jsonb DEFAULT '[]'::jsonb,
	"assigned_by" varchar(255),
	"assigned_at" timestamp,
	"teams" jsonb
);
--> statement-breakpoint
CREATE TABLE "el_elyon_shifts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_user_id" varchar(255) NOT NULL,
	"location" varchar(255) NOT NULL,
	"clock_in_time" timestamp NOT NULL,
	"clock_out_time" timestamp,
	"device_id" varchar(255),
	"kiosk_id" uuid,
	"notes" text,
	"clock_in_selfie" varchar(255),
	"clock_out_selfie" varchar(255)
);
--> statement-breakpoint
CREATE TABLE "el_elyon_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_user_id" varchar(255) NOT NULL,
	"email" varchar(255) NOT NULL,
	"name" varchar(255),
	"last_login_at" timestamp,
	"last_login_device_id" varchar(255),
	"last_login_location" varchar(255),
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "el_elyon_compliance_reminder_templates" ADD CONSTRAINT "el_elyon_compliance_reminder_templates_created_by_el_elyon_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."el_elyon_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "el_elyon_fire_evac" ADD CONSTRAINT "el_elyon_fire_evac_resident_id_el_elyon_residents_id_fk" FOREIGN KEY ("resident_id") REFERENCES "public"."el_elyon_residents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "el_elyon_guardian_checklist_links" ADD CONSTRAINT "el_elyon_guardian_checklist_links_resident_id_el_elyon_residents_id_fk" FOREIGN KEY ("resident_id") REFERENCES "public"."el_elyon_residents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "el_elyon_guardian_checklist_links" ADD CONSTRAINT "el_elyon_guardian_checklist_links_template_id_el_elyon_guardian_checklist_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."el_elyon_guardian_checklist_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "el_elyon_hr_file_logs" ADD CONSTRAINT "el_elyon_hr_file_logs_hr_file_id_el_elyon_hr_files_id_fk" FOREIGN KEY ("hr_file_id") REFERENCES "public"."el_elyon_hr_files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "el_elyon_hr_file_logs" ADD CONSTRAINT "el_elyon_hr_file_logs_employee_id_el_elyon_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."el_elyon_employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "el_elyon_hr_files" ADD CONSTRAINT "el_elyon_hr_files_employee_id_el_elyon_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."el_elyon_employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "el_elyon_isp" ADD CONSTRAINT "el_elyon_isp_resident_id_el_elyon_residents_id_fk" FOREIGN KEY ("resident_id") REFERENCES "public"."el_elyon_residents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "el_elyon_isp_access_logs" ADD CONSTRAINT "el_elyon_isp_access_logs_isp_file_id_el_elyon_isp_files_id_fk" FOREIGN KEY ("isp_file_id") REFERENCES "public"."el_elyon_isp_files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "el_elyon_isp_access_logs" ADD CONSTRAINT "el_elyon_isp_access_logs_resident_id_el_elyon_residents_id_fk" FOREIGN KEY ("resident_id") REFERENCES "public"."el_elyon_residents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "el_elyon_isp_acknowledgments" ADD CONSTRAINT "el_elyon_isp_acknowledgments_resident_id_el_elyon_residents_id_fk" FOREIGN KEY ("resident_id") REFERENCES "public"."el_elyon_residents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "el_elyon_isp_acknowledgments" ADD CONSTRAINT "el_elyon_isp_acknowledgments_isp_id_el_elyon_isp_id_fk" FOREIGN KEY ("isp_id") REFERENCES "public"."el_elyon_isp"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "el_elyon_isp_acknowledgments" ADD CONSTRAINT "el_elyon_isp_acknowledgments_acknowledged_isp_el_elyon_isp_id_fk" FOREIGN KEY ("acknowledged_isp") REFERENCES "public"."el_elyon_isp"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "el_elyon_isp_files" ADD CONSTRAINT "el_elyon_isp_files_resident_id_el_elyon_residents_id_fk" FOREIGN KEY ("resident_id") REFERENCES "public"."el_elyon_residents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "el_elyon_resident_logs" ADD CONSTRAINT "el_elyon_resident_logs_resident_id_el_elyon_residents_id_fk" FOREIGN KEY ("resident_id") REFERENCES "public"."el_elyon_residents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "el_elyon_resident_logs" ADD CONSTRAINT "el_elyon_resident_logs_shift_id_el_elyon_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."el_elyon_shifts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_logs_clerk_user_id_idx" ON "el_elyon_audit_logs" USING btree ("clerk_user_id");--> statement-breakpoint
CREATE INDEX "audit_logs_timestamp_idx" ON "el_elyon_audit_logs" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "audit_logs_event_idx" ON "el_elyon_audit_logs" USING btree ("event");--> statement-breakpoint
CREATE INDEX "compliance_alerts_status_idx" ON "el_elyon_compliance_alerts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "compliance_alerts_severity_idx" ON "el_elyon_compliance_alerts" USING btree ("severity");--> statement-breakpoint
CREATE INDEX "compliance_alerts_location_idx" ON "el_elyon_compliance_alerts" USING btree ("location");--> statement-breakpoint
CREATE INDEX "compliance_alerts_created_at_idx" ON "el_elyon_compliance_alerts" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "compliance_reminder_templates_type_idx" ON "el_elyon_compliance_reminder_templates" USING btree ("type");--> statement-breakpoint
CREATE INDEX "compliance_reminder_templates_active_idx" ON "el_elyon_compliance_reminder_templates" USING btree ("active");--> statement-breakpoint
CREATE INDEX "devices_device_id_idx" ON "el_elyon_devices" USING btree ("device_id");--> statement-breakpoint
CREATE INDEX "devices_location_idx" ON "el_elyon_devices" USING btree ("location");--> statement-breakpoint
CREATE INDEX "devices_is_active_idx" ON "el_elyon_devices" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "employees_work_email_idx" ON "el_elyon_employees" USING btree ("work_email");--> statement-breakpoint
CREATE INDEX "employees_email_idx" ON "el_elyon_employees" USING btree ("email");--> statement-breakpoint
CREATE INDEX "employees_clerk_user_id_idx" ON "el_elyon_employees" USING btree ("clerk_user_id");--> statement-breakpoint
CREATE INDEX "employees_assigned_device_id_idx" ON "el_elyon_employees" USING btree ("assigned_device_id");--> statement-breakpoint
CREATE INDEX "employees_invite_token_idx" ON "el_elyon_employees" USING btree ("invite_token");--> statement-breakpoint
CREATE INDEX "fire_evac_resident_id_idx" ON "el_elyon_fire_evac" USING btree ("resident_id");--> statement-breakpoint
CREATE INDEX "fire_evac_location_idx" ON "el_elyon_fire_evac" USING btree ("location");--> statement-breakpoint
CREATE INDEX "guardian_checklist_links_token_idx" ON "el_elyon_guardian_checklist_links" USING btree ("token");--> statement-breakpoint
CREATE INDEX "guardian_checklist_links_resident_id_idx" ON "el_elyon_guardian_checklist_links" USING btree ("resident_id");--> statement-breakpoint
CREATE INDEX "guardian_checklist_links_sent_by_idx" ON "el_elyon_guardian_checklist_links" USING btree ("sent_by");--> statement-breakpoint
CREATE INDEX "guardian_checklist_links_completed_idx" ON "el_elyon_guardian_checklist_links" USING btree ("completed");--> statement-breakpoint
CREATE INDEX "guardian_checklist_templates_active_idx" ON "el_elyon_guardian_checklist_templates" USING btree ("active");--> statement-breakpoint
CREATE INDEX "guardian_checklist_templates_created_by_idx" ON "el_elyon_guardian_checklist_templates" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "guardians_created_by_idx" ON "el_elyon_guardians" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "hr_file_logs_clerk_user_id_idx" ON "el_elyon_hr_file_logs" USING btree ("clerk_user_id");--> statement-breakpoint
CREATE INDEX "hr_file_logs_hr_file_id_idx" ON "el_elyon_hr_file_logs" USING btree ("hr_file_id");--> statement-breakpoint
CREATE INDEX "hr_file_logs_employee_id_idx" ON "el_elyon_hr_file_logs" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "hr_file_logs_timestamp_idx" ON "el_elyon_hr_file_logs" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "hr_file_logs_action_idx" ON "el_elyon_hr_file_logs" USING btree ("action");--> statement-breakpoint
CREATE INDEX "hr_files_employee_id_idx" ON "el_elyon_hr_files" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "isp_resident_id_idx" ON "el_elyon_isp" USING btree ("resident_id");--> statement-breakpoint
CREATE INDEX "isp_access_logs_isp_file_id_idx" ON "el_elyon_isp_access_logs" USING btree ("isp_file_id");--> statement-breakpoint
CREATE INDEX "isp_access_logs_resident_id_idx" ON "el_elyon_isp_access_logs" USING btree ("resident_id");--> statement-breakpoint
CREATE INDEX "isp_access_logs_clerk_user_id_idx" ON "el_elyon_isp_access_logs" USING btree ("clerk_user_id");--> statement-breakpoint
CREATE INDEX "isp_access_logs_timestamp_idx" ON "el_elyon_isp_access_logs" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "isp_access_logs_action_idx" ON "el_elyon_isp_access_logs" USING btree ("action");--> statement-breakpoint
CREATE INDEX "isp_acknowledgments_resident_user_idx" ON "el_elyon_isp_acknowledgments" USING btree ("resident_id","clerk_user_id");--> statement-breakpoint
CREATE INDEX "isp_files_resident_id_idx" ON "el_elyon_isp_files" USING btree ("resident_id");--> statement-breakpoint
CREATE INDEX "isp_files_status_idx" ON "el_elyon_isp_files" USING btree ("status");--> statement-breakpoint
CREATE INDEX "isp_files_effective_date_idx" ON "el_elyon_isp_files" USING btree ("effective_date");--> statement-breakpoint
CREATE INDEX "isp_files_resident_version_idx" ON "el_elyon_isp_files" USING btree ("resident_id","version_label");--> statement-breakpoint
CREATE INDEX "kiosk_pairing_tokens_token_idx" ON "el_elyon_kiosk_pairing_tokens" USING btree ("token");--> statement-breakpoint
CREATE INDEX "kiosk_pairing_tokens_status_idx" ON "el_elyon_kiosk_pairing_tokens" USING btree ("status");--> statement-breakpoint
CREATE INDEX "kiosks_location_idx" ON "el_elyon_kiosks" USING btree ("location");--> statement-breakpoint
CREATE INDEX "kiosks_device_id_idx" ON "el_elyon_kiosks" USING btree ("device_id");--> statement-breakpoint
CREATE INDEX "locations_name_idx" ON "el_elyon_locations" USING btree ("name");--> statement-breakpoint
CREATE INDEX "resident_logs_resident_id_idx" ON "el_elyon_resident_logs" USING btree ("resident_id");--> statement-breakpoint
CREATE INDEX "resident_logs_location_idx" ON "el_elyon_resident_logs" USING btree ("location");--> statement-breakpoint
CREATE INDEX "resident_logs_author_id_idx" ON "el_elyon_resident_logs" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "resident_logs_created_at_idx" ON "el_elyon_resident_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "residents_location_idx" ON "el_elyon_residents" USING btree ("location");--> statement-breakpoint
CREATE INDEX "residents_created_by_idx" ON "el_elyon_residents" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "roles_clerk_user_id_idx" ON "el_elyon_roles" USING btree ("clerk_user_id");--> statement-breakpoint
CREATE INDEX "shifts_clerk_user_id_idx" ON "el_elyon_shifts" USING btree ("clerk_user_id");--> statement-breakpoint
CREATE INDEX "shifts_location_idx" ON "el_elyon_shifts" USING btree ("location");--> statement-breakpoint
CREATE INDEX "shifts_clock_in_time_idx" ON "el_elyon_shifts" USING btree ("clock_in_time");--> statement-breakpoint
CREATE INDEX "users_clerk_user_id_idx" ON "el_elyon_users" USING btree ("clerk_user_id");--> statement-breakpoint
CREATE INDEX "users_email_idx" ON "el_elyon_users" USING btree ("email");
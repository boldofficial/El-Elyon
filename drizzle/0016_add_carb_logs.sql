CREATE TABLE "carb_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"resident_id" uuid NOT NULL,
	"location" varchar(255) NOT NULL,
	"operational_date" date NOT NULL,
	"meal_slot" varchar(20) NOT NULL,
	"carbs_grams" integer NOT NULL,
	"food_description" text,
	"notes" text,
	"shift_id" uuid,
	"staff_id" varchar(255) NOT NULL,
	"staff_name_snapshot" varchar(255) NOT NULL,
	"logged_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp,
	"updated_by" varchar(255),
	CONSTRAINT "carb_logs_meal_slot_check" CHECK ("carb_logs"."meal_slot" in ('breakfast', 'lunch', 'dinner', 'snack')),
	CONSTRAINT "carb_logs_carbs_grams_check" CHECK ("carb_logs"."carbs_grams" between 0 and 1000)
);
--> statement-breakpoint
ALTER TABLE "residents" ADD COLUMN "carb_tracking_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "carb_logs" ADD CONSTRAINT "carb_logs_resident_id_residents_id_fk" FOREIGN KEY ("resident_id") REFERENCES "public"."residents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carb_logs" ADD CONSTRAINT "carb_logs_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "carb_logs_resident_date_idx" ON "carb_logs" USING btree ("resident_id","operational_date");--> statement-breakpoint
CREATE INDEX "carb_logs_location_date_idx" ON "carb_logs" USING btree ("location","operational_date");--> statement-breakpoint
CREATE UNIQUE INDEX "carb_logs_main_meal_identity_uidx" ON "carb_logs" USING btree ("resident_id","operational_date","meal_slot") WHERE "carb_logs"."meal_slot" <> 'snack';
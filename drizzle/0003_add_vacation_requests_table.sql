-- Migration: Add vacation_requests table for employee vacation management
-- Created: 2025
-- Description: Implements vacation request workflow with admin approval system

-- Create vacation_requests table
CREATE TABLE IF NOT EXISTS "vacation_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_clerk_user_id" varchar(255) NOT NULL,
	"employee_name" varchar(255) NOT NULL,
	"start_date" timestamp NOT NULL,
	"end_date" timestamp NOT NULL,
	"reason" text,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"admin_comments" text,
	"admin_clerk_user_id" varchar(255),
	"admin_name" varchar(255),
	"responded_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS "vacation_requests_employee_idx" ON "vacation_requests" ("employee_clerk_user_id");
CREATE INDEX IF NOT EXISTS "vacation_requests_status_idx" ON "vacation_requests" ("status");
CREATE INDEX IF NOT EXISTS "vacation_requests_start_date_idx" ON "vacation_requests" ("start_date");

-- Add check constraint for status
ALTER TABLE "vacation_requests" ADD CONSTRAINT "vacation_requests_status_check" 
	CHECK (status IN ('pending', 'approved', 'denied'));

-- Migration: Add memos and memos_read tables for internal communication system
-- Created: 2025
-- Description: Implements memo workflow for staff communication with role-based access control

-- Create memos table
CREATE TABLE IF NOT EXISTS "memos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(500) NOT NULL,
	"content" text NOT NULL,
	"sender_clerk_user_id" varchar(255) NOT NULL,
	"sender_name" varchar(255) NOT NULL,
	"recipient_type" varchar(50) NOT NULL,
	"target_locations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"target_users" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"priority" varchar(20) DEFAULT 'normal' NOT NULL,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

-- Create memos_read tracking table
CREATE TABLE IF NOT EXISTS "memos_read" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"memo_id" uuid NOT NULL,
	"clerk_user_id" varchar(255) NOT NULL,
	"read_at" timestamp DEFAULT now() NOT NULL
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS "memos_sender_idx" ON "memos" ("sender_clerk_user_id");
CREATE INDEX IF NOT EXISTS "memos_created_at_idx" ON "memos" ("created_at");
CREATE INDEX IF NOT EXISTS "memos_recipient_type_idx" ON "memos" ("recipient_type");

CREATE INDEX IF NOT EXISTS "memos_read_memo_id_idx" ON "memos_read" ("memo_id");
CREATE INDEX IF NOT EXISTS "memos_read_clerk_user_id_idx" ON "memos_read" ("clerk_user_id");

-- Add foreign key constraint
ALTER TABLE "memos_read" ADD CONSTRAINT "memos_read_memo_id_fkey" 
	FOREIGN KEY ("memo_id") REFERENCES "memos"("id") ON DELETE CASCADE;

-- Add check constraints for recipient_type
ALTER TABLE "memos" ADD CONSTRAINT "memos_recipient_type_check" 
	CHECK (recipient_type IN ('location', 'all-staff', 'all-supervisors', 'all-employees', 'selected-locations', 'selected-users'));

-- Add check constraint for priority
ALTER TABLE "memos" ADD CONSTRAINT "memos_priority_check" 
	CHECK (priority IN ('normal', 'high', 'urgent'));

CREATE TYPE "public"."market_research_business_type" AS ENUM('obgyn', 'delivery_hospital', 'general_obgyn', 'women_hospital', 'postpartum_center');--> statement-breakpoint
CREATE TYPE "public"."market_research_operation_status" AS ENUM('operating', 'closed', 'newly_opened', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."market_research_run_status" AS ENUM('pending', 'running', 'completed', 'partial_failed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."market_research_verification_status" AS ENUM('auto_collected', 'needs_review', 'verified', 'manually_corrected');--> statement-breakpoint
CREATE TYPE "public"."sales_activity_type" AS ENUM('email', 'call', 'sns', 'visit', 'meeting', 'feedback', 'memo');--> statement-breakpoint
CREATE TYPE "public"."sales_message_status" AS ENUM('draft', 'blocked', 'queued', 'sent', 'failed');--> statement-breakpoint
CREATE TYPE "public"."sales_status" AS ENUM('not_contacted', 'material_allowed', 'material_sent', 'called', 'visit_scheduled', 'visited', 'meeting_scheduled', 'pilot_proposed', 'quotation_proposed', 'contracting', 'operating', 'closed', 'on_hold', 'rejected', 'unsubscribed');--> statement-breakpoint
CREATE TABLE "market_research_change_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"item_id" integer NOT NULL,
	"run_id" integer,
	"field_name" text NOT NULL,
	"previous_value" text,
	"new_value" text,
	"detected_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "market_research_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_id" integer,
	"stable_key" text NOT NULL,
	"business_type" "market_research_business_type" NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"region" text NOT NULL,
	"city" text,
	"district" text,
	"address" text,
	"operation_status" "market_research_operation_status" DEFAULT 'unknown' NOT NULL,
	"phone" text,
	"email" text,
	"website" text,
	"instagram" text,
	"blog" text,
	"kakao_channel" text,
	"naver_talk" text,
	"open_date" date,
	"closed_date" date,
	"is_new" boolean DEFAULT false NOT NULL,
	"has_updates" boolean DEFAULT false NOT NULL,
	"is_selected" boolean DEFAULT false NOT NULL,
	"is_delivery_hospital" boolean DEFAULT false NOT NULL,
	"delivery_count_year" integer,
	"delivery_count" integer,
	"delivery_count_source" text,
	"medical_departments" jsonb DEFAULT '[]'::jsonb,
	"doctor_counts" jsonb DEFAULT '{}'::jsonb,
	"total_doctor_count" integer,
	"has_delivery_center" boolean DEFAULT false NOT NULL,
	"has_fertility_center" boolean DEFAULT false NOT NULL,
	"has_pediatric_link" boolean DEFAULT false NOT NULL,
	"room_count" integer,
	"mother_capacity" integer,
	"baby_capacity" integer,
	"room_grades" jsonb DEFAULT '[]'::jsonb,
	"aesthetic_brand" text,
	"additional_services" jsonb DEFAULT '[]'::jsonb,
	"building_scale" text,
	"occupied_floors" text,
	"is_standalone_building" boolean,
	"parking_available" boolean,
	"latitude" text,
	"longitude" text,
	"market_score" integer DEFAULT 0 NOT NULL,
	"priority_grade" text DEFAULT 'C' NOT NULL,
	"sources" jsonb DEFAULT '[]'::jsonb,
	"source_urls" jsonb DEFAULT '[]'::jsonb,
	"source_confidence" text DEFAULT 'needs_review' NOT NULL,
	"verification_status" "market_research_verification_status" DEFAULT 'auto_collected' NOT NULL,
	"raw_data" jsonb DEFAULT '{}'::jsonb,
	"memo" text,
	"last_researched_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "market_research_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"region_scope" text DEFAULT '전국' NOT NULL,
	"regions" jsonb DEFAULT '[]'::jsonb,
	"business_types" jsonb DEFAULT '[]'::jsonb,
	"operation_statuses" jsonb DEFAULT '[]'::jsonb,
	"sources" jsonb DEFAULT '[]'::jsonb,
	"status" "market_research_run_status" DEFAULT 'pending' NOT NULL,
	"stats" jsonb DEFAULT '{}'::jsonb,
	"error_log" jsonb DEFAULT '[]'::jsonb,
	"started_at" timestamp,
	"completed_at" timestamp,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales_activities" (
	"id" serial PRIMARY KEY NOT NULL,
	"sales_lead_id" integer NOT NULL,
	"activity_type" "sales_activity_type" NOT NULL,
	"activity_date" timestamp DEFAULT now() NOT NULL,
	"channel" text,
	"subject" text,
	"content" text,
	"outcome" text,
	"next_action" text,
	"next_action_date" timestamp,
	"attachments" jsonb DEFAULT '[]'::jsonb,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales_leads" (
	"id" serial PRIMARY KEY NOT NULL,
	"market_research_item_id" integer NOT NULL,
	"client_id" integer,
	"status" "sales_status" DEFAULT 'not_contacted' NOT NULL,
	"owner_id" integer,
	"selected_by" integer,
	"selected_at" timestamp DEFAULT now() NOT NULL,
	"contact_consent_status" text DEFAULT 'unknown' NOT NULL,
	"contact_person" text,
	"contact_role" text,
	"next_action" text,
	"next_action_date" timestamp,
	"notes" text,
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales_materials" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"material_type" text DEFAULT 'company_intro' NOT NULL,
	"description" text,
	"drive_file_id" text,
	"drive_file_name" text,
	"drive_web_view_link" text,
	"external_url" text,
	"version" text DEFAULT 'v1' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"sales_lead_id" integer NOT NULL,
	"channel" text DEFAULT 'resend' NOT NULL,
	"recipients" jsonb DEFAULT '[]'::jsonb,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"material_ids" jsonb DEFAULT '[]'::jsonb,
	"status" "sales_message_status" DEFAULT 'draft' NOT NULL,
	"blocked_reason" text,
	"provider_message_id" text,
	"error_message" text,
	"sent_at" timestamp,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "market_research_change_logs" ADD CONSTRAINT "market_research_change_logs_item_id_market_research_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."market_research_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_research_change_logs" ADD CONSTRAINT "market_research_change_logs_run_id_market_research_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."market_research_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_research_items" ADD CONSTRAINT "market_research_items_run_id_market_research_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."market_research_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_research_runs" ADD CONSTRAINT "market_research_runs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_activities" ADD CONSTRAINT "sales_activities_sales_lead_id_sales_leads_id_fk" FOREIGN KEY ("sales_lead_id") REFERENCES "public"."sales_leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_activities" ADD CONSTRAINT "sales_activities_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_leads" ADD CONSTRAINT "sales_leads_market_research_item_id_market_research_items_id_fk" FOREIGN KEY ("market_research_item_id") REFERENCES "public"."market_research_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_leads" ADD CONSTRAINT "sales_leads_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_leads" ADD CONSTRAINT "sales_leads_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_leads" ADD CONSTRAINT "sales_leads_selected_by_users_id_fk" FOREIGN KEY ("selected_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_materials" ADD CONSTRAINT "sales_materials_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_messages" ADD CONSTRAINT "sales_messages_sales_lead_id_sales_leads_id_fk" FOREIGN KEY ("sales_lead_id") REFERENCES "public"."sales_leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_messages" ADD CONSTRAINT "sales_messages_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;

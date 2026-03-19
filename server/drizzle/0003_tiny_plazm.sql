DO $$ BEGIN
 CREATE TYPE "public"."billing_type" AS ENUM('monthly', 'per_event', 'one_time', 'quote_based');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."contract_status" AS ENUM('draft', 'signed', 'active', 'expired', 'terminated');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."item_category" AS ENUM('fixed', 'variable');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."monitoring_status" AS ENUM('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."payment_method" AS ENUM('lump_sum', 'installment', 'monthly_settle');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."price_unit" AS ENUM('per_month', 'per_event', 'per_person', 'per_item', 'one_time');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."quotation_status" AS ENUM('draft', 'sent', 'accepted', 'rejected', 'expired');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "client_service_contracts" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"template_id" integer NOT NULL,
	"drive_folder_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "contract_discount_policies" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"min_months" integer NOT NULL,
	"discount_type" text DEFAULT 'percentage' NOT NULL,
	"discount_rate" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "contracts" (
	"id" serial PRIMARY KEY NOT NULL,
	"contract_number" text NOT NULL,
	"quotation_id" integer,
	"client_id" integer NOT NULL,
	"title" text NOT NULL,
	"contract_months" integer NOT NULL,
	"start_date" date,
	"end_date" date,
	"subtotal" integer DEFAULT 0 NOT NULL,
	"discount_amount" integer DEFAULT 0 NOT NULL,
	"total_amount" integer DEFAULT 0 NOT NULL,
	"monthly_amount" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"common_terms" text,
	"special_terms" text,
	"status" "contract_status" DEFAULT 'draft' NOT NULL,
	"signed_at" timestamp,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "contracts_contract_number_unique" UNIQUE("contract_number")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "monitoring_results" (
	"id" serial PRIMARY KEY NOT NULL,
	"template_id" integer,
	"template_name" text,
	"client_id" integer NOT NULL,
	"status" "monitoring_status" DEFAULT 'PENDING' NOT NULL,
	"posts" jsonb,
	"statistics" jsonb,
	"summary" text,
	"execution_time_ms" integer,
	"error_log" jsonb,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"drive_file_id" text,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "monitoring_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"template_type" text DEFAULT 'integrated' NOT NULL,
	"client_id" integer NOT NULL,
	"keywords" jsonb,
	"monitoring_scope" jsonb NOT NULL,
	"search_type" text DEFAULT 'latest' NOT NULL,
	"date_range" integer DEFAULT 7 NOT NULL,
	"collect_count" integer DEFAULT 10 NOT NULL,
	"crawling_method" text DEFAULT 'api' NOT NULL,
	"target_places" jsonb,
	"target_cafes" jsonb,
	"schedule_enabled" boolean DEFAULT false NOT NULL,
	"schedule_cron" text,
	"schedule_last_run_at" timestamp,
	"is_active" boolean DEFAULT true NOT NULL,
	"analysis_mode" text DEFAULT 'FULL' NOT NULL,
	"notify_enabled" boolean DEFAULT false NOT NULL,
	"notify_channels" jsonb DEFAULT '["telegram"]'::jsonb,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notification_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer,
	"channel" text DEFAULT 'telegram' NOT NULL,
	"message_type" text DEFAULT 'monitoring' NOT NULL,
	"content" text NOT NULL,
	"status" text DEFAULT 'sent' NOT NULL,
	"error_message" text,
	"template_id" integer,
	"result_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "quotation_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"quotation_id" integer NOT NULL,
	"service_id" integer,
	"service_name" text NOT NULL,
	"tier_id" integer,
	"tier_name" text,
	"item_id" integer,
	"item_name" text NOT NULL,
	"item_category" text NOT NULL,
	"item_price_unit" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_price" integer NOT NULL,
	"amount" integer NOT NULL,
	"is_required" boolean DEFAULT true NOT NULL,
	"payment_method" "payment_method",
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "quotation_service_configs" (
	"id" serial PRIMARY KEY NOT NULL,
	"quotation_id" integer NOT NULL,
	"service_id" integer,
	"service_name" text NOT NULL,
	"billing_type" text NOT NULL,
	"selected_tier_id" integer,
	"selected_tier_name" text,
	"event_frequency" text,
	"event_payment_method" "payment_method",
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "quotations" (
	"id" serial PRIMARY KEY NOT NULL,
	"quotation_number" text NOT NULL,
	"client_id" integer NOT NULL,
	"title" text NOT NULL,
	"contract_months" integer NOT NULL,
	"discount_policy_id" integer,
	"discount_applied" boolean DEFAULT false NOT NULL,
	"subtotal" integer DEFAULT 0 NOT NULL,
	"discount_amount" integer DEFAULT 0 NOT NULL,
	"total_amount" integer DEFAULT 0 NOT NULL,
	"monthly_amount" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"status" "quotation_status" DEFAULT 'draft' NOT NULL,
	"valid_until" date,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "quotations_quotation_number_unique" UNIQUE("quotation_number")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "service_item_prices" (
	"id" serial PRIMARY KEY NOT NULL,
	"item_id" integer NOT NULL,
	"tier_id" integer,
	"price" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "service_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"service_id" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"category" "item_category" NOT NULL,
	"is_required" boolean DEFAULT true NOT NULL,
	"price_unit" "price_unit" NOT NULL,
	"unit_label" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "service_tiers" (
	"id" serial PRIMARY KEY NOT NULL,
	"service_id" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"min_quantity" integer,
	"max_quantity" integer,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "services" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"billing_type" "billing_type" NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb,
	"linked_task_template_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "services_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "manuals" DROP CONSTRAINT "manuals_author_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "task_responses" DROP CONSTRAINT "task_responses_task_id_tasks_id_fk";
--> statement-breakpoint
ALTER TABLE "task_templates" DROP CONSTRAINT "task_templates_author_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_assignee_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_client_id_clients_id_fk";
--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "telegram_chat_id" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "telegram_invite_code" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "telegram_connected_at" timestamp;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "contract_ended_at" timestamp;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "contract_start_date" date;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "contract_end_date" date;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "contract_file_drive_id" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "contract_file_name" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "business_reg_drive_id" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "business_reg_file_name" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "client_service_contracts" ADD CONSTRAINT "client_service_contracts_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "client_service_contracts" ADD CONSTRAINT "client_service_contracts_template_id_task_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."task_templates"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contracts" ADD CONSTRAINT "contracts_quotation_id_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contracts" ADD CONSTRAINT "contracts_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contracts" ADD CONSTRAINT "contracts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "monitoring_results" ADD CONSTRAINT "monitoring_results_template_id_monitoring_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."monitoring_templates"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "monitoring_results" ADD CONSTRAINT "monitoring_results_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "monitoring_results" ADD CONSTRAINT "monitoring_results_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "monitoring_templates" ADD CONSTRAINT "monitoring_templates_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "monitoring_templates" ADD CONSTRAINT "monitoring_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_template_id_monitoring_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."monitoring_templates"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_result_id_monitoring_results_id_fk" FOREIGN KEY ("result_id") REFERENCES "public"."monitoring_results"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "quotation_items" ADD CONSTRAINT "quotation_items_quotation_id_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "quotation_items" ADD CONSTRAINT "quotation_items_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "quotation_service_configs" ADD CONSTRAINT "quotation_service_configs_quotation_id_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "quotation_service_configs" ADD CONSTRAINT "quotation_service_configs_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "quotations" ADD CONSTRAINT "quotations_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "quotations" ADD CONSTRAINT "quotations_discount_policy_id_contract_discount_policies_id_fk" FOREIGN KEY ("discount_policy_id") REFERENCES "public"."contract_discount_policies"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "quotations" ADD CONSTRAINT "quotations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "service_item_prices" ADD CONSTRAINT "service_item_prices_item_id_service_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."service_items"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "service_item_prices" ADD CONSTRAINT "service_item_prices_tier_id_service_tiers_id_fk" FOREIGN KEY ("tier_id") REFERENCES "public"."service_tiers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "service_items" ADD CONSTRAINT "service_items_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "service_tiers" ADD CONSTRAINT "service_tiers_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "services" ADD CONSTRAINT "services_linked_task_template_id_task_templates_id_fk" FOREIGN KEY ("linked_task_template_id") REFERENCES "public"."task_templates"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "manuals" ADD CONSTRAINT "manuals_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "task_responses" ADD CONSTRAINT "task_responses_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "task_templates" ADD CONSTRAINT "task_templates_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "users" ADD CONSTRAINT "users_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

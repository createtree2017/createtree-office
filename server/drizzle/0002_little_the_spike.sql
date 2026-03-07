ALTER TABLE "task_responses" DROP CONSTRAINT "task_responses_instance_id_task_instances_id_fk";
--> statement-breakpoint
DROP TABLE "task_instances";--> statement-breakpoint
ALTER TABLE "task_responses" ADD COLUMN "task_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "template_id" integer;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "client_id" integer;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "drive_folder_id" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "task_responses" ADD CONSTRAINT "task_responses_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tasks" ADD CONSTRAINT "tasks_template_id_task_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."task_templates"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tasks" ADD CONSTRAINT "tasks_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "task_responses" DROP COLUMN IF EXISTS "instance_id";
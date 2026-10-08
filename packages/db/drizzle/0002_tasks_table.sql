CREATE TYPE "public"."task_status" AS ENUM('todo', 'doing', 'done');--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" "task_status" DEFAULT 'todo' NOT NULL,
	"priority" smallint DEFAULT 4 NOT NULL,
	"due_at" timestamp with time zone,
	"reminder_at" timestamp with time zone,
	"recurrence_rule" text,
	"parent_task_id" uuid,
	"position" double precision DEFAULT 0 NOT NULL,
	"completed_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "tasks_id_user_id_key" UNIQUE("id","user_id"),
	CONSTRAINT "tasks_priority_range" CHECK ("tasks"."priority" between 1 and 4),
	CONSTRAINT "tasks_not_own_parent" CHECK ("tasks"."parent_task_id" <> "tasks"."id")
);
--> statement-breakpoint
ALTER TABLE "tasks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_entity_fk" FOREIGN KEY ("id","user_id") REFERENCES "public"."entities"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_parent_fk" FOREIGN KEY ("parent_task_id","user_id") REFERENCES "public"."tasks"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tasks_user_id_idx" ON "tasks" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "tasks_user_status_idx" ON "tasks" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "tasks_parent_idx" ON "tasks" USING btree ("parent_task_id");--> statement-breakpoint
CREATE INDEX "tasks_due_at_idx" ON "tasks" USING btree ("user_id","due_at");--> statement-breakpoint
CREATE POLICY "tasks_own_rows" ON "tasks" AS PERMISSIVE FOR ALL TO "authenticated" USING ("tasks"."user_id" = (select auth.uid())) WITH CHECK ("tasks"."user_id" = (select auth.uid()));
CREATE TYPE "public"."goal_status" AS ENUM('active', 'achieved', 'dropped');--> statement-breakpoint
ALTER TYPE "public"."entity_type" ADD VALUE 'goal';--> statement-breakpoint
CREATE TABLE "goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"target_at" timestamp with time zone,
	"status" "goal_status" DEFAULT 'active' NOT NULL,
	"closed_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "goals_id_user_id_key" UNIQUE("id","user_id")
);
--> statement-breakpoint
ALTER TABLE "goals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_entity_fk" FOREIGN KEY ("id","user_id") REFERENCES "public"."entities"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "goals_user_id_idx" ON "goals" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "goals_user_status_idx" ON "goals" USING btree ("user_id","status");--> statement-breakpoint
CREATE POLICY "goals_own_rows" ON "goals" AS PERMISSIVE FOR ALL TO "authenticated" USING ("goals"."user_id" = (select auth.uid())) WITH CHECK ("goals"."user_id" = (select auth.uid()));
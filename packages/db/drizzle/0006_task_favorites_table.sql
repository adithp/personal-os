CREATE TABLE "task_favorites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"color" text NOT NULL,
	"icon" text NOT NULL,
	"view" jsonb NOT NULL,
	"position" double precision DEFAULT 0 NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "task_favorites" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "task_favorites" ADD CONSTRAINT "task_favorites_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "task_favorites_user_id_idx" ON "task_favorites" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "task_favorites_user_position_idx" ON "task_favorites" USING btree ("user_id","position") WHERE "task_favorites"."deleted_at" is null;--> statement-breakpoint
CREATE POLICY "task_favorites_own_rows" ON "task_favorites" AS PERMISSIVE FOR ALL TO "authenticated" USING ("task_favorites"."user_id" = (select auth.uid())) WITH CHECK ("task_favorites"."user_id" = (select auth.uid()));
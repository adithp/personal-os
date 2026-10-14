CREATE TABLE "note_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"content_md" text DEFAULT '' NOT NULL,
	"is_daily_default" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "note_templates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "daily_date" date;--> statement-breakpoint
ALTER TABLE "note_templates" ADD CONSTRAINT "note_templates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "note_templates_user_name_idx" ON "note_templates" USING btree ("user_id",lower("name")) WHERE "note_templates"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "note_templates_daily_default_idx" ON "note_templates" USING btree ("user_id") WHERE "note_templates"."is_daily_default" and "note_templates"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "note_templates_user_id_idx" ON "note_templates" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "notes_user_daily_date_idx" ON "notes" USING btree ("user_id","daily_date") WHERE "notes"."deleted_at" is null;--> statement-breakpoint
CREATE POLICY "note_templates_own_rows" ON "note_templates" AS PERMISSIVE FOR ALL TO "authenticated" USING ("note_templates"."user_id" = (select auth.uid())) WITH CHECK ("note_templates"."user_id" = (select auth.uid()));
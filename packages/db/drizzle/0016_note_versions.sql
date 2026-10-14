CREATE TABLE "note_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"note_id" uuid NOT NULL,
	"title" text NOT NULL,
	"content_md" text NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "note_versions_reason_check" CHECK ("note_versions"."reason" in ('auto', 'before_restore', 'conflict'))
);
--> statement-breakpoint
ALTER TABLE "note_versions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "note_versions" ADD CONSTRAINT "note_versions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_versions" ADD CONSTRAINT "note_versions_note_fk" FOREIGN KEY ("note_id","user_id") REFERENCES "public"."notes"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "note_versions_note_created_idx" ON "note_versions" USING btree ("note_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE POLICY "note_versions_own_rows" ON "note_versions" AS PERMISSIVE FOR ALL TO "authenticated" USING ("note_versions"."user_id" = (select auth.uid())) WITH CHECK ("note_versions"."user_id" = (select auth.uid()));
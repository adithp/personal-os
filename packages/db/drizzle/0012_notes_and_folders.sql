CREATE TABLE "note_folders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"parent_id" uuid,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "note_folders_id_user_id_key" UNIQUE("id","user_id")
);
--> statement-breakpoint
ALTER TABLE "note_folders" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"title" text NOT NULL,
	"content_md" text DEFAULT '' NOT NULL,
	"content_text" text DEFAULT '' NOT NULL,
	"folder_id" uuid,
	"pinned" boolean DEFAULT false NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "notes_id_user_id_key" UNIQUE("id","user_id")
);
--> statement-breakpoint
ALTER TABLE "notes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "note_folders" ADD CONSTRAINT "note_folders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_folders" ADD CONSTRAINT "note_folders_parent_fk" FOREIGN KEY ("parent_id","user_id") REFERENCES "public"."note_folders"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_entity_fk" FOREIGN KEY ("id","user_id") REFERENCES "public"."entities"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_folder_fk" FOREIGN KEY ("folder_id","user_id") REFERENCES "public"."note_folders"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "note_folders_root_name_idx" ON "note_folders" USING btree ("user_id",lower("name")) WHERE "note_folders"."parent_id" is null and "note_folders"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "note_folders_child_name_idx" ON "note_folders" USING btree ("user_id","parent_id",lower("name")) WHERE "note_folders"."parent_id" is not null and "note_folders"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "note_folders_user_id_idx" ON "note_folders" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "notes_user_title_idx" ON "notes" USING btree ("user_id",lower("title")) WHERE "notes"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "notes_user_updated_idx" ON "notes" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX "notes_user_folder_idx" ON "notes" USING btree ("user_id","folder_id");--> statement-breakpoint
CREATE POLICY "note_folders_own_rows" ON "note_folders" AS PERMISSIVE FOR ALL TO "authenticated" USING ("note_folders"."user_id" = (select auth.uid())) WITH CHECK ("note_folders"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "notes_own_rows" ON "notes" AS PERMISSIVE FOR ALL TO "authenticated" USING ("notes"."user_id" = (select auth.uid())) WITH CHECK ("notes"."user_id" = (select auth.uid()));
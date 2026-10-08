CREATE TYPE "public"."entity_type" AS ENUM('task', 'note', 'project', 'habit', 'event', 'email', 'file', 'transaction', 'subscription', 'person', 'client', 'tag');--> statement-breakpoint
CREATE TYPE "public"."link_relation" AS ENUM('mentions', 'belongs_to', 'blocks', 'derived_from', 'attached', 'related');--> statement-breakpoint
CREATE TABLE "entities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"type" "entity_type" NOT NULL,
	"title" text NOT NULL,
	"search_vector" "tsvector",
	"deleted_at" timestamp with time zone,
	CONSTRAINT "entities_id_user_id_key" UNIQUE("id","user_id")
);
--> statement-breakpoint
ALTER TABLE "entities" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source_id" uuid NOT NULL,
	"target_id" uuid NOT NULL,
	"relation" "link_relation" NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "links_no_self_link" CHECK ("links"."source_id" <> "links"."target_id")
);
--> statement-breakpoint
ALTER TABLE "links" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "entities" ADD CONSTRAINT "entities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "links" ADD CONSTRAINT "links_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "links" ADD CONSTRAINT "links_source_owner_fk" FOREIGN KEY ("source_id","user_id") REFERENCES "public"."entities"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "links" ADD CONSTRAINT "links_target_owner_fk" FOREIGN KEY ("target_id","user_id") REFERENCES "public"."entities"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "entities_user_id_idx" ON "entities" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "entities_user_type_idx" ON "entities" USING btree ("user_id","type");--> statement-breakpoint
CREATE INDEX "entities_search_vector_idx" ON "entities" USING gin ("search_vector");--> statement-breakpoint
CREATE UNIQUE INDEX "links_unique_active_idx" ON "links" USING btree ("user_id","source_id","target_id","relation") WHERE "links"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "links_user_id_idx" ON "links" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "links_source_id_idx" ON "links" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "links_target_id_idx" ON "links" USING btree ("target_id");--> statement-breakpoint
CREATE POLICY "entities_own_rows" ON "entities" AS PERMISSIVE FOR ALL TO "authenticated" USING ("entities"."user_id" = (select auth.uid())) WITH CHECK ("entities"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "links_own_rows" ON "links" AS PERMISSIVE FOR ALL TO "authenticated" USING ("links"."user_id" = (select auth.uid())) WITH CHECK ("links"."user_id" = (select auth.uid()));
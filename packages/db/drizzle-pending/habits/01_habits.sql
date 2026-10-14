CREATE TABLE "habit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"habit_id" uuid NOT NULL,
	"log_date" date NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "habit_logs_habit_date_key" UNIQUE("habit_id","log_date"),
	CONSTRAINT "habit_logs_count_check" CHECK ("habit_logs"."count" >= 1)
);
--> statement-breakpoint
ALTER TABLE "habit_logs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "habits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"category" text,
	"schedule" jsonb NOT NULL,
	"target" integer DEFAULT 1 NOT NULL,
	"reminder_time" text,
	"color" text,
	"notes" text DEFAULT '' NOT NULL,
	"start_date" date NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "habits_id_user_id_key" UNIQUE("id","user_id"),
	CONSTRAINT "habits_target_check" CHECK ("habits"."target" >= 1)
);
--> statement-breakpoint
ALTER TABLE "habits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "habit_logs" ADD CONSTRAINT "habit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habit_logs" ADD CONSTRAINT "habit_logs_habit_fk" FOREIGN KEY ("habit_id","user_id") REFERENCES "public"."habits"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habits" ADD CONSTRAINT "habits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "habit_logs_user_id_idx" ON "habit_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "habit_logs_habit_date_idx" ON "habit_logs" USING btree ("habit_id","log_date");--> statement-breakpoint
CREATE INDEX "habits_user_id_idx" ON "habits" USING btree ("user_id");--> statement-breakpoint
CREATE POLICY "habit_logs_own_rows" ON "habit_logs" AS PERMISSIVE FOR ALL TO "authenticated" USING ("habit_logs"."user_id" = (select auth.uid())) WITH CHECK ("habit_logs"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "habits_own_rows" ON "habits" AS PERMISSIVE FOR ALL TO "authenticated" USING ("habits"."user_id" = (select auth.uid())) WITH CHECK ("habits"."user_id" = (select auth.uid()));
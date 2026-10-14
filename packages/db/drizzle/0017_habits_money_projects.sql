CREATE TYPE "public"."project_status" AS ENUM('active', 'on_hold', 'done', 'archived');--> statement-breakpoint
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
CREATE TABLE "budgets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"category_id" uuid NOT NULL,
	"month" date NOT NULL,
	"amount_paise" bigint NOT NULL,
	CONSTRAINT "budgets_category_month_key" UNIQUE("user_id","category_id","month"),
	CONSTRAINT "budgets_amount_check" CHECK ("budgets"."amount_paise" > 0)
);
--> statement-breakpoint
ALTER TABLE "budgets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"color" text NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "categories_id_user_id_key" UNIQUE("id","user_id"),
	CONSTRAINT "categories_kind_check" CHECK ("categories"."kind" in ('income', 'expense'))
);
--> statement-breakpoint
ALTER TABLE "categories" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "recurring_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"kind" text NOT NULL,
	"amount_paise" bigint NOT NULL,
	"wallet_id" uuid NOT NULL,
	"to_wallet_id" uuid,
	"category_id" uuid,
	"note" text,
	"rule" text NOT NULL,
	"next_on" date NOT NULL,
	"ends_on" date,
	"active" boolean DEFAULT true NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "recurring_transactions_id_user_id_key" UNIQUE("id","user_id"),
	CONSTRAINT "recurring_kind_check" CHECK ("recurring_transactions"."kind" in ('income', 'expense', 'transfer')),
	CONSTRAINT "recurring_amount_check" CHECK ("recurring_transactions"."amount_paise" > 0)
);
--> statement-breakpoint
ALTER TABLE "recurring_transactions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "savings_goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"target_paise" bigint NOT NULL,
	"saved_paise" bigint DEFAULT 0 NOT NULL,
	"target_on" date,
	"color" text NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "savings_goals_target_check" CHECK ("savings_goals"."target_paise" > 0),
	CONSTRAINT "savings_goals_saved_check" CHECK ("savings_goals"."saved_paise" >= 0)
);
--> statement-breakpoint
ALTER TABLE "savings_goals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"kind" text NOT NULL,
	"amount_paise" bigint NOT NULL,
	"occurred_on" date NOT NULL,
	"wallet_id" uuid NOT NULL,
	"to_wallet_id" uuid,
	"category_id" uuid,
	"note" text,
	"recurring_id" uuid,
	"subscription_id" uuid,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "transactions_kind_check" CHECK ("transactions"."kind" in ('income', 'expense', 'transfer')),
	CONSTRAINT "transactions_amount_check" CHECK ("transactions"."amount_paise" > 0),
	CONSTRAINT "transactions_transfer_check" CHECK (("transactions"."kind" = 'transfer' and "transactions"."to_wallet_id" is not null and "transactions"."to_wallet_id" <> "transactions"."wallet_id")
        or ("transactions"."kind" <> 'transfer' and "transactions"."to_wallet_id" is null))
);
--> statement-breakpoint
ALTER TABLE "transactions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "wallets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'bank' NOT NULL,
	"color" text NOT NULL,
	"opening_balance_paise" bigint DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "wallets_id_user_id_key" UNIQUE("id","user_id"),
	CONSTRAINT "wallets_kind_check" CHECK ("wallets"."kind" in ('cash', 'bank', 'card', 'upi', 'other'))
);
--> statement-breakpoint
ALTER TABLE "wallets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"amount_paise" bigint NOT NULL,
	"cycle" text DEFAULT 'monthly' NOT NULL,
	"next_renewal_on" date NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"wallet_id" uuid,
	"category_id" uuid,
	"color" text NOT NULL,
	"note" text,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "subscriptions_cycle_check" CHECK ("subscriptions"."cycle" in ('weekly', 'monthly', 'quarterly', 'yearly')),
	CONSTRAINT "subscriptions_status_check" CHECK ("subscriptions"."status" in ('active', 'paused', 'cancelled')),
	CONSTRAINT "subscriptions_amount_check" CHECK ("subscriptions"."amount_paise" > 0)
);
--> statement-breakpoint
ALTER TABLE "subscriptions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"company" text,
	"notes" text,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "clients_id_user_id_key" UNIQUE("id","user_id")
);
--> statement-breakpoint
ALTER TABLE "clients" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "project_milestones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"project_id" uuid NOT NULL,
	"title" text NOT NULL,
	"due_at" timestamp with time zone,
	"done_at" timestamp with time zone,
	"position" double precision DEFAULT 0 NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "project_milestones" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" "project_status" DEFAULT 'active' NOT NULL,
	"client_id" uuid,
	"start_at" timestamp with time zone,
	"due_at" timestamp with time zone,
	"color" text,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "projects_id_user_id_key" UNIQUE("id","user_id")
);
--> statement-breakpoint
ALTER TABLE "projects" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "time_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"project_id" uuid NOT NULL,
	"task_id" uuid,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"note" text,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "time_entries_end_after_start" CHECK ("time_entries"."ended_at" is null or "time_entries"."ended_at" >= "time_entries"."started_at")
);
--> statement-breakpoint
ALTER TABLE "time_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "habit_logs" ADD CONSTRAINT "habit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habit_logs" ADD CONSTRAINT "habit_logs_habit_fk" FOREIGN KEY ("habit_id","user_id") REFERENCES "public"."habits"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habits" ADD CONSTRAINT "habits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_category_fk" FOREIGN KEY ("category_id","user_id") REFERENCES "public"."categories"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_transactions" ADD CONSTRAINT "recurring_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_transactions" ADD CONSTRAINT "recurring_wallet_fk" FOREIGN KEY ("wallet_id","user_id") REFERENCES "public"."wallets"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_transactions" ADD CONSTRAINT "recurring_to_wallet_fk" FOREIGN KEY ("to_wallet_id","user_id") REFERENCES "public"."wallets"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_transactions" ADD CONSTRAINT "recurring_category_fk" FOREIGN KEY ("category_id","user_id") REFERENCES "public"."categories"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "savings_goals" ADD CONSTRAINT "savings_goals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_wallet_fk" FOREIGN KEY ("wallet_id","user_id") REFERENCES "public"."wallets"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_to_wallet_fk" FOREIGN KEY ("to_wallet_id","user_id") REFERENCES "public"."wallets"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_fk" FOREIGN KEY ("category_id","user_id") REFERENCES "public"."categories"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_recurring_fk" FOREIGN KEY ("recurring_id","user_id") REFERENCES "public"."recurring_transactions"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_wallet_fk" FOREIGN KEY ("wallet_id","user_id") REFERENCES "public"."wallets"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_category_fk" FOREIGN KEY ("category_id","user_id") REFERENCES "public"."categories"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_entity_fk" FOREIGN KEY ("id","user_id") REFERENCES "public"."entities"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_milestones" ADD CONSTRAINT "project_milestones_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_milestones" ADD CONSTRAINT "project_milestones_project_fk" FOREIGN KEY ("project_id","user_id") REFERENCES "public"."projects"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_entity_fk" FOREIGN KEY ("id","user_id") REFERENCES "public"."entities"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_client_fk" FOREIGN KEY ("client_id","user_id") REFERENCES "public"."clients"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_project_fk" FOREIGN KEY ("project_id","user_id") REFERENCES "public"."projects"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_task_fk" FOREIGN KEY ("task_id","user_id") REFERENCES "public"."tasks"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "habit_logs_user_id_idx" ON "habit_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "habit_logs_habit_date_idx" ON "habit_logs" USING btree ("habit_id","log_date");--> statement-breakpoint
CREATE INDEX "habits_user_id_idx" ON "habits" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "budgets_user_month_idx" ON "budgets" USING btree ("user_id","month");--> statement-breakpoint
CREATE UNIQUE INDEX "categories_name_idx" ON "categories" USING btree ("user_id","kind",lower("name")) WHERE "categories"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "categories_user_id_idx" ON "categories" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "recurring_user_next_idx" ON "recurring_transactions" USING btree ("user_id","next_on");--> statement-breakpoint
CREATE INDEX "savings_goals_user_id_idx" ON "savings_goals" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "transactions_user_day_idx" ON "transactions" USING btree ("user_id","occurred_on");--> statement-breakpoint
CREATE INDEX "transactions_wallet_idx" ON "transactions" USING btree ("wallet_id");--> statement-breakpoint
CREATE INDEX "transactions_category_idx" ON "transactions" USING btree ("category_id");--> statement-breakpoint
CREATE UNIQUE INDEX "wallets_name_idx" ON "wallets" USING btree ("user_id",lower("name")) WHERE "wallets"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "wallets_user_id_idx" ON "wallets" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "subscriptions_user_renewal_idx" ON "subscriptions" USING btree ("user_id","next_renewal_on");--> statement-breakpoint
CREATE INDEX "clients_user_id_idx" ON "clients" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "project_milestones_user_id_idx" ON "project_milestones" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "project_milestones_project_idx" ON "project_milestones" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "projects_user_id_idx" ON "projects" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "projects_user_status_idx" ON "projects" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "projects_client_idx" ON "projects" USING btree ("client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "time_entries_one_running_idx" ON "time_entries" USING btree ("user_id") WHERE "time_entries"."ended_at" is null and "time_entries"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "time_entries_user_id_idx" ON "time_entries" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "time_entries_project_idx" ON "time_entries" USING btree ("project_id","started_at");--> statement-breakpoint
CREATE POLICY "habit_logs_own_rows" ON "habit_logs" AS PERMISSIVE FOR ALL TO "authenticated" USING ("habit_logs"."user_id" = (select auth.uid())) WITH CHECK ("habit_logs"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "habits_own_rows" ON "habits" AS PERMISSIVE FOR ALL TO "authenticated" USING ("habits"."user_id" = (select auth.uid())) WITH CHECK ("habits"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "budgets_own_rows" ON "budgets" AS PERMISSIVE FOR ALL TO "authenticated" USING ("budgets"."user_id" = (select auth.uid())) WITH CHECK ("budgets"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "categories_own_rows" ON "categories" AS PERMISSIVE FOR ALL TO "authenticated" USING ("categories"."user_id" = (select auth.uid())) WITH CHECK ("categories"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "recurring_transactions_own_rows" ON "recurring_transactions" AS PERMISSIVE FOR ALL TO "authenticated" USING ("recurring_transactions"."user_id" = (select auth.uid())) WITH CHECK ("recurring_transactions"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "savings_goals_own_rows" ON "savings_goals" AS PERMISSIVE FOR ALL TO "authenticated" USING ("savings_goals"."user_id" = (select auth.uid())) WITH CHECK ("savings_goals"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "transactions_own_rows" ON "transactions" AS PERMISSIVE FOR ALL TO "authenticated" USING ("transactions"."user_id" = (select auth.uid())) WITH CHECK ("transactions"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "wallets_own_rows" ON "wallets" AS PERMISSIVE FOR ALL TO "authenticated" USING ("wallets"."user_id" = (select auth.uid())) WITH CHECK ("wallets"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "subscriptions_own_rows" ON "subscriptions" AS PERMISSIVE FOR ALL TO "authenticated" USING ("subscriptions"."user_id" = (select auth.uid())) WITH CHECK ("subscriptions"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "clients_own_rows" ON "clients" AS PERMISSIVE FOR ALL TO "authenticated" USING ("clients"."user_id" = (select auth.uid())) WITH CHECK ("clients"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "project_milestones_own_rows" ON "project_milestones" AS PERMISSIVE FOR ALL TO "authenticated" USING ("project_milestones"."user_id" = (select auth.uid())) WITH CHECK ("project_milestones"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "projects_own_rows" ON "projects" AS PERMISSIVE FOR ALL TO "authenticated" USING ("projects"."user_id" = (select auth.uid())) WITH CHECK ("projects"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "time_entries_own_rows" ON "time_entries" AS PERMISSIVE FOR ALL TO "authenticated" USING ("time_entries"."user_id" = (select auth.uid())) WITH CHECK ("time_entries"."user_id" = (select auth.uid()));
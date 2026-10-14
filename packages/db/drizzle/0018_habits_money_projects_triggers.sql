-- Habits, Money and Projects: updated_at triggers (set_updated_at() from migration 0001), Realtime
-- publication, GRANT SELECT to authenticated and REVOKE from anon. Written by hand; merged from the
-- three lanes' pending files (decision 68).
-- Habits: updated_at triggers (set_updated_at() from migration 0001) and Realtime for both tables
-- (like migrations 0011 and 0013). Written by hand (drizzle-kit cannot describe these).
CREATE TRIGGER "habits_set_updated_at"
  BEFORE UPDATE ON "public"."habits"
  FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();--> statement-breakpoint
CREATE TRIGGER "habit_logs_set_updated_at"
  BEFORE UPDATE ON "public"."habit_logs"
  FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();--> statement-breakpoint
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['habits', 'habit_logs'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;--> statement-breakpoint
GRANT SELECT ON public.habits, public.habit_logs TO authenticated;--> statement-breakpoint
REVOKE ALL ON public.habits, public.habit_logs FROM anon;
--> statement-breakpoint
-- Money lane: updated_at triggers (set_updated_at() from migration 0001) and Realtime for the new
-- tables (like migrations 0011, 0013 and 0015). Written by hand (drizzle-kit cannot describe these).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['wallets', 'categories', 'transactions', 'recurring_transactions', 'budgets', 'savings_goals', 'subscriptions'] LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()',
      t || '_set_updated_at', t);
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;--> statement-breakpoint
GRANT SELECT ON public.wallets, public.categories, public.transactions, public.recurring_transactions, public.budgets, public.savings_goals, public.subscriptions TO authenticated;--> statement-breakpoint
REVOKE ALL ON public.wallets, public.categories, public.transactions, public.recurring_transactions, public.budgets, public.savings_goals, public.subscriptions FROM anon;
--> statement-breakpoint
-- Projects lane: updated_at triggers (set_updated_at() from migration 0001), Realtime, and grants
-- (like migration 0015). Written by hand (drizzle-kit cannot describe these).
CREATE TRIGGER "clients_set_updated_at"
  BEFORE UPDATE ON "public"."clients"
  FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();--> statement-breakpoint
CREATE TRIGGER "projects_set_updated_at"
  BEFORE UPDATE ON "public"."projects"
  FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();--> statement-breakpoint
CREATE TRIGGER "project_milestones_set_updated_at"
  BEFORE UPDATE ON "public"."project_milestones"
  FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();--> statement-breakpoint
CREATE TRIGGER "time_entries_set_updated_at"
  BEFORE UPDATE ON "public"."time_entries"
  FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();--> statement-breakpoint
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['clients', 'projects', 'project_milestones', 'time_entries'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;--> statement-breakpoint
GRANT SELECT ON public.clients, public.projects, public.project_milestones, public.time_entries TO authenticated;--> statement-breakpoint
REVOKE ALL ON public.clients, public.projects, public.project_milestones, public.time_entries FROM anon;

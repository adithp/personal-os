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

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

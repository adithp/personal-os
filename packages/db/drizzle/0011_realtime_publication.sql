-- Realtime (Postgres Changes) for the tables the open screens show. Written by hand.
-- Idempotent: a table already added (for example with the dashboard toggle) is skipped.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['tasks', 'tags', 'entity_tags', 'task_favorites', 'links', 'goals'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;
--> statement-breakpoint
-- Realtime only delivers rows the subscriber's role may SELECT; Supabase stops granting new tables
-- automatically on 2026-10-30. RLS (<table>_own_rows) still decides which rows.
GRANT SELECT ON public.tasks, public.tags, public.entity_tags, public.task_favorites, public.links, public.goals TO authenticated;
--> statement-breakpoint
-- DELETE events skip RLS; without any privilege the anon role receives nothing.
REVOKE ALL ON public.tasks, public.tags, public.entity_tags, public.task_favorites, public.links, public.goals FROM anon;

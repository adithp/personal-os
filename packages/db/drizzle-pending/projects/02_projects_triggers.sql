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

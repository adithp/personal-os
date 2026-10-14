-- Note templates: updated_at trigger (set_updated_at() from migration 0001) and Realtime (like
-- migrations 0011 and 0013). Written by hand (drizzle-kit cannot describe these).
CREATE TRIGGER "note_templates_set_updated_at"
  BEFORE UPDATE ON "public"."note_templates"
  FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'note_templates'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.note_templates;
  END IF;
END $$;--> statement-breakpoint
GRANT SELECT ON public.note_templates TO authenticated;--> statement-breakpoint
REVOKE ALL ON public.note_templates FROM anon;

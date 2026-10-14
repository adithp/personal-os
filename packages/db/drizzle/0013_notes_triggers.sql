-- Notes: updated_at triggers (set_updated_at() from migration 0001), the search vector (title
-- weight A, plain text weight B, simple configuration, like tasks in 0010), and Realtime for the
-- two new tables (like migration 0011). Written by hand (drizzle-kit cannot describe these).
CREATE TRIGGER "notes_set_updated_at"
  BEFORE UPDATE ON "public"."notes"
  FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();--> statement-breakpoint
CREATE TRIGGER "note_folders_set_updated_at"
  BEFORE UPDATE ON "public"."note_folders"
  FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();--> statement-breakpoint
CREATE OR REPLACE FUNCTION "public"."note_search_vector"() RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  UPDATE "public"."entities"
     SET "search_vector" =
           setweight(to_tsvector('simple', coalesce(NEW."title", '')), 'A') ||
           setweight(to_tsvector('simple', coalesce(NEW."content_text", '')), 'B')
   WHERE "id" = NEW."id" AND "user_id" = NEW."user_id";
  RETURN NULL;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "notes_search_vector_insert"
  AFTER INSERT ON "public"."notes"
  FOR EACH ROW EXECUTE FUNCTION "public"."note_search_vector"();--> statement-breakpoint
CREATE TRIGGER "notes_search_vector_update"
  AFTER UPDATE OF "title", "content_text" ON "public"."notes"
  FOR EACH ROW
  WHEN (OLD."title" IS DISTINCT FROM NEW."title" OR OLD."content_text" IS DISTINCT FROM NEW."content_text")
  EXECUTE FUNCTION "public"."note_search_vector"();--> statement-breakpoint
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['notes', 'note_folders'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;--> statement-breakpoint
GRANT SELECT ON public.notes, public.note_folders TO authenticated;--> statement-breakpoint
REVOKE ALL ON public.notes, public.note_folders FROM anon;

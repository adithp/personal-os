-- Keeps updated_at current: every UPDATE on entities and links sets it to now().
-- Written by hand (drizzle-kit cannot describe functions and triggers).
CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW."updated_at" = now();
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "entities_set_updated_at"
  BEFORE UPDATE ON "public"."entities"
  FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();--> statement-breakpoint
CREATE TRIGGER "links_set_updated_at"
  BEFORE UPDATE ON "public"."links"
  FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();

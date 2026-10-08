-- Keeps updated_at current on tags and entity_tags, using set_updated_at() from migration 0001.
-- Written by hand (drizzle-kit cannot describe triggers).
CREATE TRIGGER "tags_set_updated_at"
  BEFORE UPDATE ON "public"."tags"
  FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();--> statement-breakpoint
CREATE TRIGGER "entity_tags_set_updated_at"
  BEFORE UPDATE ON "public"."entity_tags"
  FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();

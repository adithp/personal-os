-- Keeps updated_at current on task_favorites, using set_updated_at() from migration 0001.
-- Written by hand (drizzle-kit cannot describe triggers).
CREATE TRIGGER "task_favorites_set_updated_at"
  BEFORE UPDATE ON "public"."task_favorites"
  FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();

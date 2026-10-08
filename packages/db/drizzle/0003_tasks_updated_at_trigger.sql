-- Keeps tasks.updated_at current, using the set_updated_at() function from migration 0001.
-- Written by hand (drizzle-kit cannot describe triggers).
CREATE TRIGGER "tasks_set_updated_at"
  BEFORE UPDATE ON "public"."tasks"
  FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();

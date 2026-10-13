-- Keeps updated_at current on goals, using set_updated_at() from migration 0001.
-- Written by hand (drizzle-kit cannot describe triggers).
CREATE TRIGGER "goals_set_updated_at"
  BEFORE UPDATE ON "public"."goals"
  FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();

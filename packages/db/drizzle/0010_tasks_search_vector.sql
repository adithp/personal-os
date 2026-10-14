-- Fills entities.search_vector for tasks: title weight A, description weight B, the simple
-- configuration (decision 42). Written by hand (drizzle-kit cannot describe functions and triggers).
CREATE OR REPLACE FUNCTION "public"."task_search_vector"() RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  UPDATE "public"."entities"
     SET "search_vector" =
           setweight(to_tsvector('simple', coalesce(NEW."title", '')), 'A') ||
           setweight(to_tsvector('simple', coalesce(NEW."description", '')), 'B')
   WHERE "id" = NEW."id" AND "user_id" = NEW."user_id";
  RETURN NULL;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "tasks_search_vector_insert"
  AFTER INSERT ON "public"."tasks"
  FOR EACH ROW EXECUTE FUNCTION "public"."task_search_vector"();--> statement-breakpoint
CREATE TRIGGER "tasks_search_vector_update"
  AFTER UPDATE OF "title", "description" ON "public"."tasks"
  FOR EACH ROW
  WHEN (OLD."title" IS DISTINCT FROM NEW."title" OR OLD."description" IS DISTINCT FROM NEW."description")
  EXECUTE FUNCTION "public"."task_search_vector"();--> statement-breakpoint
UPDATE "public"."entities" AS e
   SET "search_vector" =
         setweight(to_tsvector('simple', coalesce(t."title", '')), 'A') ||
         setweight(to_tsvector('simple', coalesce(t."description", '')), 'B')
  FROM "public"."tasks" AS t
 WHERE t."id" = e."id" AND t."user_id" = e."user_id";

ALTER TABLE "worlds" ADD COLUMN "is_default" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "worlds"
SET "is_default" = true
WHERE "id" LIKE 'default_%';--> statement-breakpoint
WITH "first_worlds" AS (
	SELECT DISTINCT ON ("user_id") "id"
	FROM "worlds"
	WHERE "user_id" NOT IN (
		SELECT "user_id" FROM "worlds" WHERE "is_default" = true
	)
	ORDER BY "user_id", "created_at"
)
UPDATE "worlds"
SET "is_default" = true
FROM "first_worlds"
WHERE "worlds"."id" = "first_worlds"."id";--> statement-breakpoint
CREATE UNIQUE INDEX "worlds_one_default_per_user_idx"
ON "worlds" ("user_id")
WHERE "is_default" = true;

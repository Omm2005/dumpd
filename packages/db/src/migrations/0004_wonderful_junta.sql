ALTER TABLE "worlds" ADD COLUMN "position_x" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "worlds" ADD COLUMN "position_y" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
WITH "ranked_worlds" AS (
	SELECT
		"id",
		ROW_NUMBER() OVER (
			PARTITION BY "user_id"
			ORDER BY "created_at"
		) - 1 AS "position_index"
	FROM "worlds"
)
UPDATE "worlds"
SET
	"position_x" = MOD("ranked_worlds"."position_index", 4) * 280,
	"position_y" = FLOOR("ranked_worlds"."position_index" / 4.0) * 210
FROM "ranked_worlds"
WHERE "worlds"."id" = "ranked_worlds"."id";

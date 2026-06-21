ALTER TABLE "dumps" ADD COLUMN "position_x" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "dumps" ADD COLUMN "position_y" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
WITH "ranked_dumps" AS (
	SELECT
		"id",
		ROW_NUMBER() OVER (
			PARTITION BY "user_id"
			ORDER BY "created_at" DESC
		) - 1 AS "position_index"
	FROM "dumps"
)
UPDATE "dumps"
SET
	"position_x" = MOD("ranked_dumps"."position_index", 3) * 320,
	"position_y" = FLOOR("ranked_dumps"."position_index" / 3.0) * 220
FROM "ranked_dumps"
WHERE "dumps"."id" = "ranked_dumps"."id";

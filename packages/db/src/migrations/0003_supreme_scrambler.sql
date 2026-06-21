CREATE TABLE "worlds" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dumps" ADD COLUMN "world_id" text;--> statement-breakpoint
INSERT INTO "worlds" ("id", "user_id", "name")
SELECT 'default_' || MD5("id"), "id", 'My World'
FROM "user";--> statement-breakpoint
UPDATE "dumps"
SET "world_id" = 'default_' || MD5("user_id");--> statement-breakpoint
ALTER TABLE "dumps" ALTER COLUMN "world_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "worlds" ADD CONSTRAINT "worlds_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "worlds_user_id_idx" ON "worlds" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "worlds_created_at_idx" ON "worlds" USING btree ("created_at");--> statement-breakpoint
ALTER TABLE "dumps" ADD CONSTRAINT "dumps_world_id_worlds_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dumps_world_id_idx" ON "dumps" USING btree ("world_id");

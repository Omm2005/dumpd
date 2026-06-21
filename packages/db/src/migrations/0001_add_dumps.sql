CREATE TABLE "dumps" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" text DEFAULT 'note' NOT NULL,
	"title" text NOT NULL,
	"content" json NOT NULL,
	"plain_text" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dumps" ADD CONSTRAINT "dumps_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dumps_user_id_idx" ON "dumps" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "dumps_created_at_idx" ON "dumps" USING btree ("created_at");
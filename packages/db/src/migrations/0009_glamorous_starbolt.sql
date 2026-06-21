CREATE TYPE "public"."source_status" AS ENUM('pending', 'processing', 'ready', 'failed');--> statement-breakpoint
CREATE TYPE "public"."source_type" AS ENUM('pdf', 'note', 'image', 'video', 'audio', 'link');--> statement-breakpoint
CREATE TABLE "chunks" (
	"chunk_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"content" text NOT NULL,
	"chunk_index" integer NOT NULL,
	"token_count" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "embeddings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chunk_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"embedding" vector(768) NOT NULL,
	"content" text NOT NULL,
	"user_id" text NOT NULL,
	"modality" text NOT NULL,
	"title" text NOT NULL,
	"chunk_index" integer NOT NULL,
	"page_num" integer,
	"timestamp_start" double precision,
	"url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"source_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"type" "source_type" NOT NULL,
	"title" text NOT NULL,
	"file_path" text,
	"url" text,
	"mime_type" text,
	"raw_text" text NOT NULL,
	"status" "source_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chunks" ADD CONSTRAINT "chunks_source_id_sources_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("source_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "embeddings" ADD CONSTRAINT "embeddings_chunk_id_chunks_chunk_id_fk" FOREIGN KEY ("chunk_id") REFERENCES "public"."chunks"("chunk_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "embeddings" ADD CONSTRAINT "embeddings_source_id_sources_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("source_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "embeddings" ADD CONSTRAINT "embeddings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sources" ADD CONSTRAINT "sources_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chunks_source_id_idx" ON "chunks" USING btree ("source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "chunks_source_index_idx" ON "chunks" USING btree ("source_id","chunk_index");--> statement-breakpoint
CREATE UNIQUE INDEX "embeddings_chunk_id_idx" ON "embeddings" USING btree ("chunk_id");--> statement-breakpoint
CREATE INDEX "embeddings_source_id_idx" ON "embeddings" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "embeddings_user_id_idx" ON "embeddings" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "embeddings_modality_idx" ON "embeddings" USING btree ("modality");--> statement-breakpoint
CREATE INDEX "embeddings_created_at_idx" ON "embeddings" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "embeddings_vector_hnsw_idx" ON "embeddings" USING hnsw ("embedding" vector_cosine_ops) WITH (m=16,ef_construction=64);--> statement-breakpoint
CREATE INDEX "sources_user_id_idx" ON "sources" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sources_created_at_idx" ON "sources" USING btree ("created_at");
CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
CREATE TABLE "dump_embeddings" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"world_id" text NOT NULL,
	"dump_id" text NOT NULL,
	"chunk_index" integer NOT NULL,
	"text" text NOT NULL,
	"embedding" vector(768) NOT NULL,
	"metadata" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dump_entities" (
	"dump_id" text NOT NULL,
	"entity_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_entities" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"world_id" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_relationships" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"world_id" text NOT NULL,
	"dump_id" text NOT NULL,
	"from_entity_id" text NOT NULL,
	"relation" text NOT NULL,
	"to_entity_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dump_embeddings" ADD CONSTRAINT "dump_embeddings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dump_embeddings" ADD CONSTRAINT "dump_embeddings_world_id_worlds_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dump_embeddings" ADD CONSTRAINT "dump_embeddings_dump_id_dumps_id_fk" FOREIGN KEY ("dump_id") REFERENCES "public"."dumps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dump_entities" ADD CONSTRAINT "dump_entities_dump_id_dumps_id_fk" FOREIGN KEY ("dump_id") REFERENCES "public"."dumps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dump_entities" ADD CONSTRAINT "dump_entities_entity_id_knowledge_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."knowledge_entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_entities" ADD CONSTRAINT "knowledge_entities_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_entities" ADD CONSTRAINT "knowledge_entities_world_id_worlds_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_relationships" ADD CONSTRAINT "knowledge_relationships_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_relationships" ADD CONSTRAINT "knowledge_relationships_world_id_worlds_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_relationships" ADD CONSTRAINT "knowledge_relationships_dump_id_dumps_id_fk" FOREIGN KEY ("dump_id") REFERENCES "public"."dumps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_relationships" ADD CONSTRAINT "knowledge_relationships_from_entity_id_knowledge_entities_id_fk" FOREIGN KEY ("from_entity_id") REFERENCES "public"."knowledge_entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_relationships" ADD CONSTRAINT "knowledge_relationships_to_entity_id_knowledge_entities_id_fk" FOREIGN KEY ("to_entity_id") REFERENCES "public"."knowledge_entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "dump_embeddings_dump_chunk_idx" ON "dump_embeddings" USING btree ("dump_id","chunk_index");--> statement-breakpoint
CREATE INDEX "dump_embeddings_world_id_idx" ON "dump_embeddings" USING btree ("world_id");--> statement-breakpoint
CREATE INDEX "dump_embeddings_vector_idx" ON "dump_embeddings" USING hnsw ("embedding" vector_cosine_ops) WITH (m=16,ef_construction=64);--> statement-breakpoint
CREATE UNIQUE INDEX "dump_entities_dump_entity_idx" ON "dump_entities" USING btree ("dump_id","entity_id");--> statement-breakpoint
CREATE INDEX "dump_entities_entity_id_idx" ON "dump_entities" USING btree ("entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_entities_world_name_idx" ON "knowledge_entities" USING btree ("user_id","world_id","name");--> statement-breakpoint
CREATE INDEX "knowledge_entities_world_id_idx" ON "knowledge_entities" USING btree ("world_id");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_relationships_source_idx" ON "knowledge_relationships" USING btree ("dump_id","from_entity_id","relation","to_entity_id");--> statement-breakpoint
CREATE INDEX "knowledge_relationships_world_id_idx" ON "knowledge_relationships" USING btree ("world_id");--> statement-breakpoint
CREATE INDEX "knowledge_relationships_from_entity_idx" ON "knowledge_relationships" USING btree ("from_entity_id");--> statement-breakpoint
CREATE INDEX "knowledge_relationships_to_entity_idx" ON "knowledge_relationships" USING btree ("to_entity_id");

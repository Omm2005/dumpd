CREATE TABLE "knowledge_entities" (
	"entity_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_entity_chunks" (
	"entity_id" uuid NOT NULL,
	"chunk_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "knowledge_entity_chunks_entity_id_chunk_id_pk" PRIMARY KEY("entity_id","chunk_id")
);
--> statement-breakpoint
CREATE TABLE "knowledge_relation_chunks" (
	"relation_id" uuid NOT NULL,
	"chunk_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "knowledge_relation_chunks_relation_id_chunk_id_pk" PRIMARY KEY("relation_id","chunk_id")
);
--> statement-breakpoint
CREATE TABLE "knowledge_relations" (
	"relation_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"source_id" uuid NOT NULL,
	"from_entity_id" uuid NOT NULL,
	"to_entity_id" uuid NOT NULL,
	"type" text NOT NULL,
	"weight" double precision NOT NULL,
	"reaction" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "knowledge_entities" ADD CONSTRAINT "knowledge_entities_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_entity_chunks" ADD CONSTRAINT "knowledge_entity_chunks_entity_id_knowledge_entities_entity_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."knowledge_entities"("entity_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_entity_chunks" ADD CONSTRAINT "knowledge_entity_chunks_chunk_id_chunks_chunk_id_fk" FOREIGN KEY ("chunk_id") REFERENCES "public"."chunks"("chunk_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_entity_chunks" ADD CONSTRAINT "knowledge_entity_chunks_source_id_sources_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("source_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_relation_chunks" ADD CONSTRAINT "knowledge_relation_chunks_relation_id_knowledge_relations_relation_id_fk" FOREIGN KEY ("relation_id") REFERENCES "public"."knowledge_relations"("relation_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_relation_chunks" ADD CONSTRAINT "knowledge_relation_chunks_chunk_id_chunks_chunk_id_fk" FOREIGN KEY ("chunk_id") REFERENCES "public"."chunks"("chunk_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_relations" ADD CONSTRAINT "knowledge_relations_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_relations" ADD CONSTRAINT "knowledge_relations_source_id_sources_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("source_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_relations" ADD CONSTRAINT "knowledge_relations_from_entity_id_knowledge_entities_entity_id_fk" FOREIGN KEY ("from_entity_id") REFERENCES "public"."knowledge_entities"("entity_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_relations" ADD CONSTRAINT "knowledge_relations_to_entity_id_knowledge_entities_entity_id_fk" FOREIGN KEY ("to_entity_id") REFERENCES "public"."knowledge_entities"("entity_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_entities_user_name_type_idx" ON "knowledge_entities" USING btree ("user_id","name","type");--> statement-breakpoint
CREATE INDEX "knowledge_entities_user_id_idx" ON "knowledge_entities" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "knowledge_entity_chunks_chunk_id_idx" ON "knowledge_entity_chunks" USING btree ("chunk_id");--> statement-breakpoint
CREATE INDEX "knowledge_entity_chunks_source_id_idx" ON "knowledge_entity_chunks" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "knowledge_relation_chunks_chunk_id_idx" ON "knowledge_relation_chunks" USING btree ("chunk_id");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_relations_source_edge_type_idx" ON "knowledge_relations" USING btree ("source_id","from_entity_id","to_entity_id","type");--> statement-breakpoint
CREATE INDEX "knowledge_relations_user_id_idx" ON "knowledge_relations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "knowledge_relations_source_id_idx" ON "knowledge_relations" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "knowledge_relations_from_entity_idx" ON "knowledge_relations" USING btree ("from_entity_id");--> statement-breakpoint
CREATE INDEX "knowledge_relations_to_entity_idx" ON "knowledge_relations" USING btree ("to_entity_id");
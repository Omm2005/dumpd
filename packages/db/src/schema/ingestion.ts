import { relations, sql } from "drizzle-orm";
import {
  doublePrecision,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";

export const sourceTypeEnum = pgEnum("source_type", [
  "pdf",
  "note",
  "image",
  "video",
  "audio",
  "link",
]);

export const sourceStatusEnum = pgEnum("source_status", [
  "pending",
  "processing",
  "ready",
  "failed",
]);

export const sources = pgTable(
  "sources",
  {
    sourceId: uuid("source_id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    type: sourceTypeEnum("type").notNull(),
    title: text("title").notNull(),
    filePath: text("file_path"),
    url: text("url"),
    mimeType: text("mime_type"),
    rawText: text("raw_text").notNull(),
    reaction: text("reaction"),
    status: sourceStatusEnum("status").default("pending").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("sources_user_id_idx").on(table.userId),
    index("sources_created_at_idx").on(table.createdAt),
  ],
);

export const chunks = pgTable(
  "chunks",
  {
    chunkId: uuid("chunk_id").defaultRandom().primaryKey(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.sourceId, { onDelete: "cascade" }),
    content: text("content").notNull(),
    chunkIndex: integer("chunk_index").notNull(),
    tokenCount: integer("token_count").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("chunks_source_id_idx").on(table.sourceId),
    uniqueIndex("chunks_source_index_idx").on(
      table.sourceId,
      table.chunkIndex,
    ),
  ],
);

export const embeddings = pgTable(
  "embeddings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    chunkId: uuid("chunk_id")
      .notNull()
      .references(() => chunks.chunkId, { onDelete: "cascade" }),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.sourceId, { onDelete: "cascade" }),
    content: text("content").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    modality: text("modality").notNull(),
    title: text("title").notNull(),
    chunkIndex: integer("chunk_index").notNull(),
    pageNum: integer("page_num"),
    timestampStart: doublePrecision("timestamp_start"),
    url: text("url"),
    vectorObjectPath: text("vector_object_path"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("embeddings_chunk_id_idx").on(table.chunkId),
    index("embeddings_source_id_idx").on(table.sourceId),
    index("embeddings_user_id_idx").on(table.userId),
    index("embeddings_modality_idx").on(table.modality),
    index("embeddings_created_at_idx").on(table.createdAt),
    index("embeddings_user_modality_created_idx").on(
      table.userId,
      table.modality,
      table.createdAt,
    ),
    index("embeddings_content_fts_idx").using(
      "gin",
      sql`to_tsvector('english', ${table.content})`,
    ),
  ],
);

export const sourcesRelations = relations(sources, ({ one, many }) => ({
  user: one(user, {
    fields: [sources.userId],
    references: [user.id],
  }),
  chunks: many(chunks),
  embeddings: many(embeddings),
}));

export const chunksRelations = relations(chunks, ({ one }) => ({
  source: one(sources, {
    fields: [chunks.sourceId],
    references: [sources.sourceId],
  }),
  embedding: one(embeddings, {
    fields: [chunks.chunkId],
    references: [embeddings.chunkId],
  }),
}));

export const embeddingsRelations = relations(embeddings, ({ one }) => ({
  chunk: one(chunks, {
    fields: [embeddings.chunkId],
    references: [chunks.chunkId],
  }),
  source: one(sources, {
    fields: [embeddings.sourceId],
    references: [sources.sourceId],
  }),
  user: one(user, {
    fields: [embeddings.userId],
    references: [user.id],
  }),
}));

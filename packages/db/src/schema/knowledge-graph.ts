import { relations } from "drizzle-orm";
import {
  doublePrecision,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { chunks, sources } from "./ingestion";

export const knowledgeEntities = pgTable(
  "knowledge_entities",
  {
    entityId: uuid("entity_id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: text("type").notNull(),
    description: text("description").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("knowledge_entities_user_name_type_idx").on(
      table.userId,
      table.name,
      table.type,
    ),
    index("knowledge_entities_user_id_idx").on(table.userId),
  ],
);

export const knowledgeEntityChunks = pgTable(
  "knowledge_entity_chunks",
  {
    entityId: uuid("entity_id")
      .notNull()
      .references(() => knowledgeEntities.entityId, { onDelete: "cascade" }),
    chunkId: uuid("chunk_id")
      .notNull()
      .references(() => chunks.chunkId, { onDelete: "cascade" }),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.sourceId, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.entityId, table.chunkId] }),
    index("knowledge_entity_chunks_chunk_id_idx").on(table.chunkId),
    index("knowledge_entity_chunks_source_id_idx").on(table.sourceId),
  ],
);

export const knowledgeRelations = pgTable(
  "knowledge_relations",
  {
    relationId: uuid("relation_id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.sourceId, { onDelete: "cascade" }),
    fromEntityId: uuid("from_entity_id")
      .notNull()
      .references(() => knowledgeEntities.entityId, { onDelete: "cascade" }),
    toEntityId: uuid("to_entity_id")
      .notNull()
      .references(() => knowledgeEntities.entityId, { onDelete: "cascade" }),
    type: text("type").notNull(),
    weight: doublePrecision("weight").notNull(),
    reaction: text("reaction"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("knowledge_relations_source_edge_type_idx").on(
      table.sourceId,
      table.fromEntityId,
      table.toEntityId,
      table.type,
    ),
    index("knowledge_relations_user_id_idx").on(table.userId),
    index("knowledge_relations_source_id_idx").on(table.sourceId),
    index("knowledge_relations_from_entity_idx").on(table.fromEntityId),
    index("knowledge_relations_to_entity_idx").on(table.toEntityId),
  ],
);

export const knowledgeRelationChunks = pgTable(
  "knowledge_relation_chunks",
  {
    relationId: uuid("relation_id")
      .notNull()
      .references(() => knowledgeRelations.relationId, {
        onDelete: "cascade",
      }),
    chunkId: uuid("chunk_id")
      .notNull()
      .references(() => chunks.chunkId, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.relationId, table.chunkId] }),
    index("knowledge_relation_chunks_chunk_id_idx").on(table.chunkId),
  ],
);

export const knowledgeEntitiesRelations = relations(
  knowledgeEntities,
  ({ one, many }) => ({
    user: one(user, {
      fields: [knowledgeEntities.userId],
      references: [user.id],
    }),
    chunks: many(knowledgeEntityChunks),
    outgoingRelations: many(knowledgeRelations, {
      relationName: "knowledge_relation_from",
    }),
    incomingRelations: many(knowledgeRelations, {
      relationName: "knowledge_relation_to",
    }),
  }),
);

export const knowledgeEntityChunksRelations = relations(
  knowledgeEntityChunks,
  ({ one }) => ({
    entity: one(knowledgeEntities, {
      fields: [knowledgeEntityChunks.entityId],
      references: [knowledgeEntities.entityId],
    }),
    chunk: one(chunks, {
      fields: [knowledgeEntityChunks.chunkId],
      references: [chunks.chunkId],
    }),
    source: one(sources, {
      fields: [knowledgeEntityChunks.sourceId],
      references: [sources.sourceId],
    }),
  }),
);

export const knowledgeRelationsRelations = relations(
  knowledgeRelations,
  ({ one, many }) => ({
    user: one(user, {
      fields: [knowledgeRelations.userId],
      references: [user.id],
    }),
    source: one(sources, {
      fields: [knowledgeRelations.sourceId],
      references: [sources.sourceId],
    }),
    fromEntity: one(knowledgeEntities, {
      fields: [knowledgeRelations.fromEntityId],
      references: [knowledgeEntities.entityId],
      relationName: "knowledge_relation_from",
    }),
    toEntity: one(knowledgeEntities, {
      fields: [knowledgeRelations.toEntityId],
      references: [knowledgeEntities.entityId],
      relationName: "knowledge_relation_to",
    }),
    chunks: many(knowledgeRelationChunks),
  }),
);

export const knowledgeRelationChunksRelations = relations(
  knowledgeRelationChunks,
  ({ one }) => ({
    relation: one(knowledgeRelations, {
      fields: [knowledgeRelationChunks.relationId],
      references: [knowledgeRelations.relationId],
    }),
    chunk: one(chunks, {
      fields: [knowledgeRelationChunks.chunkId],
      references: [chunks.chunkId],
    }),
  }),
);

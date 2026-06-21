import { db } from "@dumpd/db";
import {
  knowledgeEntities,
  knowledgeEntityChunks,
  knowledgeRelationChunks,
  knowledgeRelations,
} from "@dumpd/db/schema/knowledge-graph";
import { and, eq, inArray, or, sql } from "drizzle-orm";

import type { EntityExtraction } from "./ingestion/gemini";

function normalizeName(value: string) {
  return value.trim().toLocaleLowerCase();
}

function normalizeRelationType(value: string) {
  const normalized = value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized || "RELATES_TO";
}

export type AttributedExtraction = EntityExtraction & {
  entityChunkIds: Map<string, string[]>;
  relationChunkIds: Map<string, string[]>;
};

export async function retrieveGraphChunkIds({
  chunkIds,
  userId,
  graphHops,
}: {
  chunkIds: string[];
  userId: string;
  graphHops: number;
}) {
  if (chunkIds.length === 0) return [];

  const seedRows = await db
    .selectDistinct({ entityId: knowledgeEntityChunks.entityId })
    .from(knowledgeEntityChunks)
    .innerJoin(
      knowledgeEntities,
      eq(knowledgeEntities.entityId, knowledgeEntityChunks.entityId),
    )
    .where(
      and(
        eq(knowledgeEntities.userId, userId),
        inArray(knowledgeEntityChunks.chunkId, chunkIds),
      ),
    );
  const seedIds = seedRows.map(({ entityId }) => entityId);
  if (seedIds.length === 0) return [];

  const visited = new Set(seedIds);
  const neighborIds = new Set<string>();
  let frontier = seedIds;
  const hops = Math.min(Math.max(Math.trunc(graphHops), 1), 5);

  for (let hop = 0; hop < hops && frontier.length > 0; hop += 1) {
    const edges = await db
      .select({
        fromEntityId: knowledgeRelations.fromEntityId,
        toEntityId: knowledgeRelations.toEntityId,
      })
      .from(knowledgeRelations)
      .where(
        and(
          eq(knowledgeRelations.userId, userId),
          or(
            inArray(knowledgeRelations.fromEntityId, frontier),
            inArray(knowledgeRelations.toEntityId, frontier),
          ),
        ),
      );

    const next: string[] = [];
    for (const edge of edges) {
      for (const entityId of [edge.fromEntityId, edge.toEntityId]) {
        if (visited.has(entityId)) continue;
        visited.add(entityId);
        neighborIds.add(entityId);
        next.push(entityId);
      }
    }
    frontier = next;
  }

  if (neighborIds.size === 0) return [];
  const rows = await db
    .selectDistinct({ chunkId: knowledgeEntityChunks.chunkId })
    .from(knowledgeEntityChunks)
    .where(inArray(knowledgeEntityChunks.entityId, [...neighborIds]));
  return rows.map(({ chunkId }) => chunkId);
}

export async function writeExtractionToGraph({
  sourceId,
  userId,
  reaction,
  extraction,
}: {
  sourceId: string;
  userId: string;
  reaction?: string | null;
  extraction: AttributedExtraction;
}) {
  const entities = new Map(
    extraction.entities.map((entity) => [normalizeName(entity.name), entity]),
  );

  await db.transaction(async (tx) => {
    await tx
      .delete(knowledgeRelations)
      .where(eq(knowledgeRelations.sourceId, sourceId));
    await tx
      .delete(knowledgeEntityChunks)
      .where(eq(knowledgeEntityChunks.sourceId, sourceId));
    await tx.execute(sql`
      delete from ${knowledgeEntities} as entity
      where entity.user_id = ${userId}
        and not exists (
          select 1
          from ${knowledgeEntityChunks} as mention
          where mention.entity_id = entity.entity_id
        )
        and not exists (
          select 1
          from ${knowledgeRelations} as relation
          where relation.from_entity_id = entity.entity_id
             or relation.to_entity_id = entity.entity_id
        )
    `);

    const entityIds = new Map<string, string>();
    for (const [name, entity] of entities) {
      const [stored] = await tx
        .insert(knowledgeEntities)
        .values({
          userId,
          name,
          type: entity.type,
          description: entity.description,
        })
        .onConflictDoUpdate({
          target: [
            knowledgeEntities.userId,
            knowledgeEntities.name,
            knowledgeEntities.type,
          ],
          set: {
            description: entity.description
              ? entity.description
              : sql`${knowledgeEntities.description}`,
            updatedAt: new Date(),
          },
        })
        .returning({ entityId: knowledgeEntities.entityId });
      if (!stored) throw new Error(`Could not store graph entity "${name}".`);
      entityIds.set(name, stored.entityId);

      const entityChunkIds = [
        ...new Set(extraction.entityChunkIds.get(name) ?? []),
      ];
      if (entityChunkIds.length > 0) {
        await tx
          .insert(knowledgeEntityChunks)
          .values(
            entityChunkIds.map((chunkId) => ({
              entityId: stored.entityId,
              chunkId,
              sourceId,
            })),
          )
          .onConflictDoNothing();
      }
    }

    for (const relation of extraction.relations) {
      const from = normalizeName(relation.from);
      const to = normalizeName(relation.to);
      const fromEntityId = entityIds.get(from);
      const toEntityId = entityIds.get(to);
      if (!fromEntityId || !toEntityId || fromEntityId === toEntityId) {
        continue;
      }

      const type = normalizeRelationType(relation.type);
      const [stored] = await tx
        .insert(knowledgeRelations)
        .values({
          userId,
          sourceId,
          fromEntityId,
          toEntityId,
          type,
          weight: relation.weight,
          reaction: reaction ?? null,
        })
        .onConflictDoUpdate({
          target: [
            knowledgeRelations.sourceId,
            knowledgeRelations.fromEntityId,
            knowledgeRelations.toEntityId,
            knowledgeRelations.type,
          ],
          set: {
            weight: relation.weight,
            reaction: reaction ?? null,
            updatedAt: new Date(),
          },
        })
        .returning({ relationId: knowledgeRelations.relationId });
      if (!stored) throw new Error(`Could not store graph relation "${type}".`);

      const key = `${from}\u0000${to}\u0000${type}`;
      const relationChunkIds = [
        ...new Set(extraction.relationChunkIds.get(key) ?? []),
      ];
      if (relationChunkIds.length > 0) {
        await tx
          .insert(knowledgeRelationChunks)
          .values(
            relationChunkIds.map((chunkId) => ({
              relationId: stored.relationId,
              chunkId,
            })),
          )
          .onConflictDoNothing();
      }
    }
  });
}

import { randomUUID } from "node:crypto";

import { db } from "@dumpd/db";
import {
  chunks,
  embeddings,
  sources,
} from "@dumpd/db/schema/ingestion";
import { and, eq, gte } from "drizzle-orm";

import {
  type AttributedExtraction,
  writeExtractionToGraph,
} from "@/lib/knowledge-graph";
import { upsertVectors } from "@/lib/supabase-vectors";

import { chunkSourceText } from "./chunk-text";
import {
  embedDocuments,
  extractEntitiesAndRelations,
  type EntityExtraction,
} from "./gemini";

type StoredChunk = {
  chunkId: string;
  content: string;
  chunkIndex: number;
  tokenCount: number;
};

function normalizeName(value: string) {
  return value.trim().toLocaleLowerCase();
}

function normalizeRelationType(value: string) {
  return (
    value
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_]+/g, "_")
      .replace(/^_+|_+$/g, "") || "RELATES_TO"
  );
}

function matchingChunkIds(name: string, storedChunks: StoredChunk[]) {
  const needle = normalizeName(name);
  return storedChunks
    .filter((chunk) => chunk.content.toLocaleLowerCase().includes(needle))
    .map((chunk) => chunk.chunkId);
}

function attributeExtraction(
  extraction: EntityExtraction,
  storedChunks: StoredChunk[],
): AttributedExtraction {
  const entityChunkIds = new Map<string, string[]>();
  for (const entity of extraction.entities) {
    entityChunkIds.set(
      normalizeName(entity.name),
      matchingChunkIds(entity.name, storedChunks),
    );
  }

  const relationChunkIds = new Map<string, string[]>();
  for (const relation of extraction.relations) {
    const from = normalizeName(relation.from);
    const to = normalizeName(relation.to);
    const type = normalizeRelationType(relation.type);
    const both = storedChunks
      .filter((chunk) => {
        const content = chunk.content.toLocaleLowerCase();
        return content.includes(from) && content.includes(to);
      })
      .map((chunk) => chunk.chunkId);
    const fallback = [
      ...(entityChunkIds.get(from) ?? []),
      ...(entityChunkIds.get(to) ?? []),
    ];
    relationChunkIds.set(
      `${from}\u0000${to}\u0000${type}`,
      [...new Set(both.length > 0 ? both : fallback)],
    );
  }

  return { ...extraction, entityChunkIds, relationChunkIds };
}

async function setStatus(
  sourceId: string,
  status: "processing" | "ready" | "failed",
) {
  await db
    .update(sources)
    .set({ status, updatedAt: new Date() })
    .where(eq(sources.sourceId, sourceId));
}

async function markFailed(sourceId: string, step: string, error: unknown) {
  console.error(`Source ingestion ${step} failed for ${sourceId}.`, error);
  try {
    await setStatus(sourceId, "failed");
  } catch (statusError) {
    console.error(`Could not mark source ${sourceId} as failed.`, statusError);
  }
}

export async function ingestSource(sourceId: string): Promise<void> {
  let source: typeof sources.$inferSelect;

  try {
    const [found] = await db
      .select()
      .from(sources)
      .where(eq(sources.sourceId, sourceId))
      .limit(1);
    if (!found) {
      console.error(`Source ${sourceId} was not found.`);
      return;
    }
    source = found;
    await setStatus(sourceId, "processing");
  } catch (error) {
    await markFailed(sourceId, "initialization", error);
    return;
  }

  let storedChunks: StoredChunk[];
  let chunkCount = 0;

  try {
    const prepared = chunkSourceText(source.rawText, source.type, source.title);
    chunkCount = prepared.length;
    storedChunks = await Promise.all(
      prepared.map((chunk) =>
        db
          .insert(chunks)
          .values({
            chunkId: randomUUID(),
            sourceId,
            content: chunk.content,
            chunkIndex: chunk.chunkIndex,
            tokenCount: chunk.tokenCount,
          })
          .onConflictDoUpdate({
            target: [chunks.sourceId, chunks.chunkIndex],
            set: {
              content: chunk.content,
              tokenCount: chunk.tokenCount,
            },
          })
          .returning({
            chunkId: chunks.chunkId,
            content: chunks.content,
            chunkIndex: chunks.chunkIndex,
            tokenCount: chunks.tokenCount,
          })
          .then(([stored]) => {
            if (!stored) throw new Error("Chunk upsert returned no row.");
            return stored;
          }),
      ),
    );
    storedChunks = storedChunks.sort((a, b) => a.chunkIndex - b.chunkIndex);
  } catch (error) {
    await markFailed(sourceId, "chunking", error);
    return;
  }

  try {
    const embeddingInputs = storedChunks.map((chunk) =>
      source.reaction
        ? `${chunk.content}\n\nUser reaction: ${source.reaction}`
        : chunk.content,
    );
    const vectors = await embedDocuments(embeddingInputs);
    const vectorKeys = storedChunks.map(
      (chunk) => `${source.userId}/${sourceId}/${chunk.chunkId}`,
    );
    await upsertVectors(
      storedChunks.map((chunk, index) => ({
        key: vectorKeys[index]!,
        embedding: vectors[index]!,
        metadata: {
          chunkId: chunk.chunkId,
          sourceId,
          userId: source.userId,
          modality: source.type,
          title: source.title,
          chunkIndex: chunk.chunkIndex,
          content: chunk.content,
          createdAt: source.createdAt.getTime(),
          ...(source.reaction ? { reaction: source.reaction } : {}),
          ...(source.type === "link" && source.url
            ? { url: source.url }
            : {}),
        },
      })),
    );
    await Promise.all(
      storedChunks.map((chunk, index) =>
        db
          .insert(embeddings)
          .values({
            id: randomUUID(),
            chunkId: chunk.chunkId,
          sourceId,
          content: chunk.content,
            userId: source.userId,
            modality: source.type,
            title: source.title,
            chunkIndex: chunk.chunkIndex,
            pageNum: null,
            timestampStart: null,
            url: source.type === "link" ? source.url : null,
            vectorObjectPath: vectorKeys[index]!,
          })
          .onConflictDoUpdate({
            target: embeddings.chunkId,
            set: {
              sourceId,
              content: chunk.content,
              userId: source.userId,
              modality: source.type,
              title: source.title,
              chunkIndex: chunk.chunkIndex,
              pageNum: null,
              timestampStart: null,
              url: source.type === "link" ? source.url : null,
              vectorObjectPath: vectorKeys[index]!,
            },
          }),
      ),
    );
    await db
      .delete(chunks)
      .where(
        and(
          eq(chunks.sourceId, sourceId),
          gte(chunks.chunkIndex, chunkCount),
        ),
      );
  } catch (error) {
    await markFailed(sourceId, "embedding", error);
    return;
  }

  let attributed: AttributedExtraction | undefined;

  try {
    const extractionText = source.reaction
      ? `${source.rawText}\n\nUser reaction: ${source.reaction}`
      : source.rawText;
    const extraction =
      source.type === "image" ||
      source.type === "video" ||
      source.type === "audio"
        ? await extractMediaChunks(storedChunks, source.reaction)
        : await extractEntitiesAndRelations(extractionText);
    attributed = attributeExtraction(extraction, storedChunks);
  } catch (error) {
    // Non-critical: chunks and embeddings are already stored and searchable.
    // Graph enrichment is best-effort, so the source is still "ready".
    console.error(`Entity extraction failed for source ${sourceId}.`, error);
  }

  if (attributed) {
    try {
      await writeExtractionToGraph({
        sourceId,
        userId: source.userId,
        reaction: source.reaction,
        extraction: attributed,
      });
    } catch (error) {
      console.error(`Knowledge graph write failed for source ${sourceId}.`, error);
    }
  }

  try {
    await setStatus(sourceId, "ready");
  } catch (error) {
    console.error(`Could not finalize source ${sourceId} status.`, error);
  }
}

async function extractMediaChunks(
  storedChunks: StoredChunk[],
  reaction?: string | null,
) {
  const extractions = await Promise.all(
    storedChunks.map((chunk) =>
      extractEntitiesAndRelations(
        reaction
          ? `${chunk.content}\n\nUser reaction: ${reaction}`
          : chunk.content,
      ),
    ),
  );
  const entities = new Map<string, EntityExtraction["entities"][number]>();
  const relations = new Map<string, EntityExtraction["relations"][number]>();

  for (const extraction of extractions) {
    for (const entity of extraction.entities) {
      entities.set(`${normalizeName(entity.name)}\u0000${entity.type}`, entity);
    }
    for (const relation of extraction.relations) {
      relations.set(
        `${normalizeName(relation.from)}\u0000${normalizeName(relation.to)}\u0000${normalizeRelationType(relation.type)}`,
        relation,
      );
    }
  }

  return {
    entities: [...entities.values()],
    relations: [...relations.values()],
  };
}

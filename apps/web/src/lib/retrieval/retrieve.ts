import { db } from "@dumpd/db";
import { embeddings, sources } from "@dumpd/db/schema/ingestion";
import {
  and,
  desc,
  eq,
  gte,
  inArray,
  lte,
  sql,
  type SQL,
} from "drizzle-orm";
import { z } from "zod";

import { retrieveGraphChunkIds } from "@/lib/knowledge-graph";
import {
  embedQuery,
  generateAnswer,
  generateJson,
} from "@/lib/ingestion/gemini";
import { queryVectors } from "@/lib/supabase-vectors";
import { checkLlmCache, setLlmCache } from "@/lib/ai-memory";

import { reciprocalRankFusion } from "./rrf";

export type RetrieveOptions = {
  modality?: string[];
  limit?: number;
  graphHops?: number;
  dateFrom?: Date;
  dateTo?: Date;
  worldId?: string;
  workingMemory?: string;
  longTermMemory?: string;
};

export type Source = {
  sourceId: string;
  worldId: string | null;
  title: string;
  modality: string;
  url: string | null;
};

export type Chunk = {
  chunkId: string;
  sourceId: string;
  worldId: string | null;
  content: string;
  title: string;
  modality: string;
  url: string | null;
  reaction: string | null;
  notes: string | null;
  score: number;
  rrfScore: number;
  rerankScore: number;
  sources: Array<"vector" | "graph">;
};

export type RetrievalResult = {
  answer: string;
  sources: Source[];
  chunks: Chunk[];
};

type SearchChunk = Omit<
  Chunk,
  "rrfScore" | "rerankScore" | "sources"
> & {
  createdAt: Date;
};

const MIN_RELEVANCE_SCORE = 80;

const rerankSchema = z.object({
  score: z.number().min(0).max(100),
});

const ANSWER_SYSTEM_PROMPT = `You are a personal knowledge assistant. You have access to the user's saved content — notes, links, PDFs, images, videos, and music.
Answer the user's question using only the provided context chunks.
Be conversational and personal — reference specific things they saved, their reactions, and their notes where relevant.
If the context includes a reaction or personal note from the user, weave it into your answer naturally.
If you cannot answer from the context, say so clearly.
Cite sources by title at the end.`;

function filters(userId: string, options: RetrieveOptions) {
  const conditions: SQL[] = [eq(embeddings.userId, userId)];
  if (options.modality?.length) {
    conditions.push(inArray(embeddings.modality, options.modality));
  }
  if (options.dateFrom) {
    conditions.push(gte(embeddings.createdAt, options.dateFrom));
  }
  if (options.dateTo) {
    conditions.push(lte(embeddings.createdAt, options.dateTo));
  }
  return conditions;
}

function rowSelection(score: SQL<number>) {
  return {
    chunkId: embeddings.chunkId,
    sourceId: embeddings.sourceId,
    worldId: sql<string | null>`(
      select dump.world_id
      from dumps as dump
      where dump.id = ${embeddings.sourceId}::text
      limit 1
    )`,
    content: embeddings.content,
    title: embeddings.title,
    modality: embeddings.modality,
    url: sources.url,
    reaction: sources.reaction,
    notes: sql<string | null>`(
      select dump.content->>'notes'
      from dumps as dump
      where dump.id = ${embeddings.sourceId}::text
      limit 1
    )`,
    score,
    createdAt: embeddings.createdAt,
  };
}

async function denseSearch(
  queryVector: number[],
  userId: string,
  options: RetrieveOptions,
) {
  const matches = await queryVectors(queryVector, {
    userId,
    modality: options.modality,
    dateFrom: options.dateFrom,
    dateTo: options.dateTo,
    topK: 20,
  });
  if (matches.length === 0) return [];

  const scoreByChunkId = new Map(
    matches.map((match) => [
      typeof match.metadata.chunkId === "string"
        ? match.metadata.chunkId
        : match.key.split("/").at(-1)!,
      1 - match.distance,
    ]),
  );
  const rows = await db
    .select(rowSelection(sql<number>`0`))
    .from(embeddings)
    .innerJoin(sources, eq(sources.sourceId, embeddings.sourceId))
    .where(
      and(
        ...filters(userId, options),
        inArray(embeddings.chunkId, [...scoreByChunkId.keys()]),
      ),
    );

  return (rows as SearchChunk[])
    .map((row) => ({
      ...row,
      score: scoreByChunkId.get(row.chunkId) ?? 0,
    }))
    .sort((a, b) => b.score - a.score);
}

async function sparseSearch(
  query: string,
  userId: string,
  options: RetrieveOptions,
) {
  const document = sql`to_tsvector('english', ${embeddings.content})`;
  const queryTerms = sql`plainto_tsquery('english', ${query})`;
  const rank = sql<number>`ts_rank(${document}, ${queryTerms})`;
  return db
    .select(rowSelection(rank))
    .from(embeddings)
    .innerJoin(sources, eq(sources.sourceId, embeddings.sourceId))
    .where(and(...filters(userId, options), sql`${document} @@ ${queryTerms}`))
    .orderBy(desc(rank))
    .limit(20) as Promise<SearchChunk[]>;
}

async function graphChunks(
  baseChunks: SearchChunk[],
  userId: string,
  options: RetrieveOptions,
) {
  const graphIds = await retrieveGraphChunkIds({
    chunkIds: baseChunks.map((chunk) => chunk.chunkId),
    userId,
    graphHops: options.graphHops ?? 2,
  });
  if (graphIds.length === 0) return [];

  return db
    .select(rowSelection(sql<number>`0`))
    .from(embeddings)
    .innerJoin(sources, eq(sources.sourceId, embeddings.sourceId))
    .where(
      and(
        ...filters(userId, options),
        inArray(embeddings.chunkId, graphIds),
      ),
    )
    .limit(100) as Promise<SearchChunk[]>;
}

async function rerank(query: string, candidates: Chunk[]) {
  const ranked: Chunk[] = [];

  for (let start = 0; start < candidates.length; start += 10) {
    const batch = candidates.slice(start, start + 10);
    const results = await Promise.all(
      batch.map(async (chunk) => {
        try {
          const result = rerankSchema.parse(
            await generateJson(
              `Score how relevant this chunk is to the query from 0 to 100.
Only scores of 80 or higher should mean the chunk directly and reliably helps answer the query.
Query: ${query}
Chunk: ${chunk.content}
Return ONLY a JSON object: { "score": number }`,
            ),
          );
          return { ...chunk, rerankScore: result.score };
        } catch (error) {
          console.warn(`Reranking failed for chunk ${chunk.chunkId}.`, error);
          return { ...chunk, rerankScore: 0 };
        }
      }),
    );
    ranked.push(...results);
  }

  return ranked.sort((a, b) => b.rerankScore - a.rerankScore);
}

function answerContext(query: string, chunks: Chunk[], workingMemory?: string) {
  const context = chunks
    .map(
      (chunk, index) => `${index + 1}. ${chunk.title} (${chunk.modality})
${chunk.content}
${chunk.reaction ? `Reaction: ${chunk.reaction}` : ""}
${chunk.notes ? `Notes: ${chunk.notes}` : ""}
---`,
    )
    .join("\n");
  const memoryPrefix = workingMemory
    ? `Recent conversation:\n${workingMemory}\n\n`
    : "";
  return `${memoryPrefix}${query}\n\n${context}`;
}

export async function retrieve(
  query: string,
  userId: string,
  options: RetrieveOptions = {},
): Promise<RetrievalResult> {
  const empty: RetrievalResult = { answer: "Could not generate answer", sources: [], chunks: [] };
  const normalizedQuery = query.trim();
  if (!normalizedQuery || !userId) return empty;

  try {
    const cached = await checkLlmCache(userId, normalizedQuery);
    if (cached) return cached as RetrievalResult;

    const inventory = await inventorySearch(normalizedQuery, userId, options);
    if (inventory) {
      void setLlmCache(userId, normalizedQuery, inventory);
      return inventory;
    }

    let queryVector: number[];
    try {
      queryVector = await embedQuery(normalizedQuery);
    } catch (error) {
      console.warn("Query embedding failed; dense retrieval is unavailable.", error);
      queryVector = [];
    }

    const [denseResult, sparseResult] = await Promise.allSettled([
      queryVector.length
        ? denseSearch(queryVector, userId, options)
        : Promise.resolve([]),
      sparseSearch(normalizedQuery, userId, options),
    ]);
    const dense =
      denseResult.status === "fulfilled"
        ? denseResult.value
        : (console.warn("Dense search failed; using sparse results.", denseResult.reason), []);
    const sparse =
      sparseResult.status === "fulfilled"
        ? sparseResult.value
        : (console.warn("Sparse search failed; using dense results.", sparseResult.reason), []);

    const fused = reciprocalRankFusion([dense, sparse]).slice(0, 5);
    const fusedChunks = fused.map((chunk) => ({
      ...chunk,
      rrfScore: chunk.rrfScore,
      rerankScore: 0,
      sources: ["vector"] as Array<"vector" | "graph">,
    }));

    let expanded: SearchChunk[] = [];
    try {
      expanded = await graphChunks(fused, userId, options);
    } catch (error) {
      console.warn("Graph expansion failed; continuing without graph chunks.", error);
    }

    const candidates = new Map<string, Chunk>(
      fusedChunks.map((chunk) => [chunk.chunkId, chunk]),
    );
    for (const chunk of expanded) {
      const existing = candidates.get(chunk.chunkId);
      if (existing) {
        existing.sources = ["vector", "graph"];
      } else {
        candidates.set(chunk.chunkId, {
          ...chunk,
          rrfScore: 0,
          rerankScore: 0,
          sources: ["graph"],
        });
      }
    }

    const limit = Math.min(Math.max(options.limit ?? 8, 1), 20);
    const finalChunks = (
      await rerank(normalizedQuery, [...candidates.values()])
    )
      .filter((chunk) => chunk.rerankScore >= MIN_RELEVANCE_SCORE)
      .slice(0, limit);
    if (finalChunks.length === 0) {
      return {
        answer: "I couldn't find any saved content that was relevant enough to answer that.",
        sources: [],
        chunks: [],
      };
    }

    let answer = "Could not generate answer";
    try {
      const systemPrompt = options.longTermMemory
        ? `${ANSWER_SYSTEM_PROMPT}\n\nWhat you know about this user: ${options.longTermMemory}`
        : ANSWER_SYSTEM_PROMPT;
      answer = await generateAnswer(
        systemPrompt,
        answerContext(normalizedQuery, finalChunks, options.workingMemory),
      );
    } catch (error) {
      console.warn("Answer generation failed.", error);
    }

    const resultSources = [
      ...new Map(
        finalChunks.map((chunk) => [
          chunk.sourceId,
          {
            sourceId: chunk.sourceId,
            worldId: chunk.worldId,
            title: chunk.title,
            modality: chunk.modality,
            url: chunk.url,
          },
        ]),
      ).values(),
    ];
    const result: RetrievalResult = { answer, sources: resultSources, chunks: finalChunks };
    void setLlmCache(userId, normalizedQuery, result);
    return result;
  } catch (error) {
    console.error("Retrieval pipeline failed.", error);
    return empty;
  }
}

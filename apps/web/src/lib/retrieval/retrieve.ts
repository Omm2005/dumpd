import { db } from "@dumpd/db";
import { dumps } from "@dumpd/db/schema/dumps";
import { embeddings, sources } from "@dumpd/db/schema/ingestion";
import {
  and,
  asc,
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

import { reciprocalRankFusion } from "./rrf";

export type RetrieveOptions = {
  modality?: string[];
  limit?: number;
  graphHops?: number;
  dateFrom?: Date;
  dateTo?: Date;
  worldId?: string;
  conversationContext?: string;
};

export type Source = {
  sourceId: string;
  worldId: string | null;
  title: string;
  modality: string;
  url: string | null;
  previewUrl?: string | null;
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
Do not add a Sources section; the interface renders sources separately.`;

const TYPE_FILTERS = [
  {
    pattern: /\b(images?|photos?|pictures?)\b/i,
    dumpTypes: ["photo", "image"],
    label: "image",
  },
  {
    pattern: /\b(notes?)\b/i,
    dumpTypes: ["note"],
    label: "note",
  },
  {
    pattern: /\b(links?|articles?|webpages?)\b/i,
    dumpTypes: ["article", "link"],
    label: "link",
  },
  {
    pattern: /\b(pdf|pdfs|documents?|files?)\b/i,
    dumpTypes: ["document", "pdf"],
    label: "document",
  },
  {
    pattern: /\b(videos?|clips?)\b/i,
    dumpTypes: ["video"],
    label: "video",
  },
  {
    pattern: /\b(music|songs?|audio|tracks?)\b/i,
    dumpTypes: ["music", "audio"],
    label: "music item",
  },
] as const;

const INVENTORY_CUE =
  /\b(all|every|show|list|find|get|give|return|display|what|which|how many|count|do i have|saved)\b/i;

function inventoryIntent(query: string) {
  if (!INVENTORY_CUE.test(query)) return null;

  const typed = TYPE_FILTERS.find(({ pattern }) => pattern.test(query));
  if (typed) return typed;

  if (/\b(items?|content|dumps?|everything|anything)\b/i.test(query)) {
    return { dumpTypes: [] as string[], label: "saved item" };
  }

  return null;
}

function normalizedModality(type: string) {
  if (type === "photo") return "image";
  if (type === "article") return "link";
  if (type === "document") return "pdf";
  return type;
}

async function inventorySearch(
  query: string,
  userId: string,
  options: RetrieveOptions,
): Promise<RetrievalResult | null> {
  const intent = inventoryIntent(query);
  if (!intent) return null;

  const conditions: SQL[] = [eq(dumps.userId, userId)];
  if (options.worldId) conditions.push(eq(dumps.worldId, options.worldId));
  if (intent.dumpTypes.length > 0) {
    conditions.push(inArray(dumps.type, [...intent.dumpTypes]));
  }
  if (options.dateFrom) conditions.push(gte(dumps.createdAt, options.dateFrom));
  if (options.dateTo) conditions.push(lte(dumps.createdAt, options.dateTo));

  const rows = await db
    .select({
      id: dumps.id,
      worldId: dumps.worldId,
      type: dumps.type,
      title: dumps.title,
      content: dumps.content,
      plainText: dumps.plainText,
      createdAt: dumps.createdAt,
    })
    .from(dumps)
    .where(and(...conditions))
    .orderBy(asc(dumps.createdAt))
    .limit(100);

  const plural = rows.length === 1 ? intent.label : `${intent.label}s`;
  if (rows.length === 0) {
    return {
      answer: `I couldn't find any ${plural} in ${options.worldId ? "this world" : "your saved content"}.`,
      sources: [],
      chunks: [],
    };
  }

  const resultSources: Source[] = rows.map((row) => {
    const content = row.content as Record<string, unknown>;
    const modality = normalizedModality(row.type);
    const sourceUrl =
      typeof content.sourceUrl === "string"
        ? content.sourceUrl
        : typeof content.url === "string"
          ? content.url
          : null;
    return {
      sourceId: row.id,
      worldId: row.worldId,
      title: row.title,
      modality,
      url: sourceUrl,
      previewUrl: modality === "image" ? `/api/photos/${row.id}` : null,
    };
  });

  const list = rows
    .slice(0, 20)
    .map((row, index) => `${index + 1}. **${row.title}**`)
    .join("\n");
  const remaining = rows.length > 20 ? `\n\n…and ${rows.length - 20} more.` : "";

  return {
    answer: `I found **${rows.length} ${plural}** ${options.worldId ? "in this world" : "across your saved content"}.\n\n${list}${remaining}`,
    sources: resultSources,
    chunks: [],
  };
}

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
  if (options.worldId) {
    conditions.push(sql`exists (
      select 1
      from dumps as scoped_dump
      where scoped_dump.id = ${embeddings.sourceId}::text
        and scoped_dump.world_id = ${options.worldId}
    )`);
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

async function directDumpSearch(
  query: string,
  userId: string,
  options: RetrieveOptions,
) {
  const document = sql`to_tsvector(
    'english',
    coalesce(${dumps.title}, '') || ' ' || coalesce(${dumps.plainText}, '')
  )`;
  const queryTerms = sql`plainto_tsquery('english', ${query})`;
  const rank = sql<number>`ts_rank(${document}, ${queryTerms})`;
  const conditions: SQL[] = [
    eq(dumps.userId, userId),
    sql`${document} @@ ${queryTerms}`,
  ];
  if (options.worldId) conditions.push(eq(dumps.worldId, options.worldId));
  if (options.dateFrom) conditions.push(gte(dumps.createdAt, options.dateFrom));
  if (options.dateTo) conditions.push(lte(dumps.createdAt, options.dateTo));

  const rows = await db
    .select({
      chunkId: dumps.id,
      sourceId: dumps.id,
      worldId: dumps.worldId,
      content: dumps.plainText,
      title: dumps.title,
      modality: dumps.type,
      url: sql<string | null>`coalesce(
        ${dumps.content}->>'sourceUrl',
        ${dumps.content}->>'url'
      )`,
      reaction: sql<string | null>`${dumps.content}->>'reaction'`,
      notes: sql<string | null>`${dumps.content}->>'notes'`,
      score: rank,
      createdAt: dumps.createdAt,
    })
    .from(dumps)
    .where(and(...conditions))
    .orderBy(desc(rank))
    .limit(20);

  return rows as SearchChunk[];
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

function answerContext(query: string, chunks: Chunk[]) {
  const context = chunks
    .map(
      (chunk, index) => `${index + 1}. ${chunk.title} (${chunk.modality})
${chunk.content}
${chunk.reaction ? `Reaction: ${chunk.reaction}` : ""}
${chunk.notes ? `Notes: ${chunk.notes}` : ""}
---`,
    )
    .join("\n");
  return `${query}\n\n${context}`;
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
    const inventory = await inventorySearch(normalizedQuery, userId, options);
    if (inventory) return inventory;

    let queryVector: number[];
    try {
      queryVector = await embedQuery(normalizedQuery);
    } catch (error) {
      console.warn("Query embedding failed; dense retrieval is unavailable.", error);
      queryVector = [];
    }

    const [denseResult, sparseResult, directResult] = await Promise.allSettled([
      queryVector.length
        ? denseSearch(queryVector, userId, options)
        : Promise.resolve([]),
      sparseSearch(normalizedQuery, userId, options),
      directDumpSearch(normalizedQuery, userId, options),
    ]);
    const dense =
      denseResult.status === "fulfilled"
        ? denseResult.value
        : (console.warn("Dense search failed; using sparse results.", denseResult.reason), []);
    const sparse =
      sparseResult.status === "fulfilled"
        ? sparseResult.value
        : (console.warn("Sparse search failed; using dense results.", sparseResult.reason), []);
    const direct =
      directResult.status === "fulfilled"
        ? directResult.value
        : (console.warn("Direct dump search failed.", directResult.reason), []);

    const fused = reciprocalRankFusion([dense, sparse, direct]).slice(0, 8);
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
      answer = await generateAnswer(
        ANSWER_SYSTEM_PROMPT,
        `${options.conversationContext ? `Recent conversation:\n${options.conversationContext}\n\n` : ""}Current query and retrieved context:\n${answerContext(normalizedQuery, finalChunks)}`,
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
            modality: normalizedModality(chunk.modality),
            url: chunk.url,
            previewUrl:
              normalizedModality(chunk.modality) === "image"
                ? `/api/photos/${chunk.sourceId}`
                : null,
          },
        ]),
      ).values(),
    ];
    return { answer, sources: resultSources, chunks: finalChunks };
  } catch (error) {
    console.error("Retrieval pipeline failed.", error);
    return empty;
  }
}

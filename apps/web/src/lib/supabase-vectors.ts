import { createClient } from "@supabase/supabase-js";

import { env } from "@dumpd/env/server";

const VECTOR_DIMENSIONS = 768;

let indexPromise: ReturnType<typeof createVectorIndex> | undefined;

function getClient() {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "Supabase Vector Storage is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

async function createVectorIndex() {
  const supabase = getClient();
  const vectors = supabase.storage.vectors;
  const bucketName = env.SUPABASE_VECTOR_BUCKET;
  const indexName = env.SUPABASE_VECTOR_INDEX;
  const bucketResult = await vectors.getBucket(bucketName);

  if (bucketResult.error) {
    const createResult = await vectors.createBucket(bucketName);
    if (
      createResult.error &&
      !/already exists|conflict/i.test(createResult.error.message)
    ) {
      throw createResult.error;
    }
  }

  const bucket = vectors.from(bucketName);
  const indexResult = await bucket.getIndex(indexName);

  if (indexResult.error) {
    const createResult = await bucket.createIndex({
      indexName,
      dataType: "float32",
      dimension: VECTOR_DIMENSIONS,
      distanceMetric: "cosine",
      metadataConfiguration: {
        nonFilterableMetadataKeys: ["content", "reaction"],
      },
    });
    if (
      createResult.error &&
      !/already exists|conflict/i.test(createResult.error.message)
    ) {
      throw createResult.error;
    }
  } else if (
    indexResult.data.index.dimension !== VECTOR_DIMENSIONS ||
    indexResult.data.index.distanceMetric !== "cosine"
  ) {
    throw new Error(
      `Supabase vector index ${indexName} must use ${VECTOR_DIMENSIONS} dimensions and cosine distance.`,
    );
  }

  return bucket.index(indexName);
}

function getVectorIndex() {
  indexPromise ??= createVectorIndex();
  return indexPromise;
}

export type StoredVector = {
  key: string;
  embedding: number[];
  metadata: Record<string, unknown>;
};

export async function upsertVectors(vectors: StoredVector[]) {
  if (vectors.length === 0) return;
  const index = await getVectorIndex();

  for (let start = 0; start < vectors.length; start += 500) {
    const result = await index.putVectors({
      vectors: vectors.slice(start, start + 500).map((vector) => ({
        key: vector.key,
        data: { float32: vector.embedding },
        metadata: vector.metadata,
      })),
    });
    if (result.error) throw result.error;
  }
}

export type VectorQueryOptions = {
  userId: string;
  modality?: string[];
  dateFrom?: Date;
  dateTo?: Date;
  topK?: number;
};

export async function queryVectors(
  embedding: number[],
  options: VectorQueryOptions,
) {
  const index = await getVectorIndex();
  const filter: Record<string, unknown> = {
    userId: options.userId,
  };
  if (options.modality?.length) {
    filter.modality = { $in: options.modality };
  }
  if (options.dateFrom || options.dateTo) {
    filter.createdAt = {
      ...(options.dateFrom ? { $gte: options.dateFrom.getTime() } : {}),
      ...(options.dateTo ? { $lte: options.dateTo.getTime() } : {}),
    };
  }

  const result = await index.queryVectors({
    queryVector: { float32: embedding },
    topK: options.topK ?? 20,
    filter,
    returnDistance: true,
    returnMetadata: true,
  });
  if (result.error) throw result.error;

  return result.data.vectors.map((vector) => ({
    key: vector.key,
    distance: vector.distance ?? 1,
    metadata: vector.metadata ?? {},
  }));
}

export async function deleteVectors(keys: string[]) {
  if (keys.length === 0) return;
  const index = await getVectorIndex();

  for (let start = 0; start < keys.length; start += 500) {
    const result = await index.deleteVectors({
      keys: keys.slice(start, start + 500),
    });
    if (result.error) throw result.error;
  }
}

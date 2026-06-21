import { createHash } from "node:crypto";

import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText, Output } from "ai";
import { z } from "zod";

import { env } from "@dumpd/env/server";

import { getRedis } from "./redis";

type CachedRetrievalResult = {
  answer: string;
  sources: unknown[];
  chunks: unknown[];
};

// ─── Working Memory (session-scoped, 2hr TTL) ────────────────────────────────

const WORKING_TTL = 7200;

export async function getWorkingMemory(
  userId: string,
  sessionId: string,
): Promise<string> {
  try {
    const redis = getRedis();
    if (!redis) return "";
    const messages = await redis.lrange(
      `working_memory:${userId}:${sessionId}`,
      -10,
      -1,
    );
    return messages.join("\n");
  } catch {
    return "";
  }
}

export async function appendToWorkingMemory(
  userId: string,
  sessionId: string,
  query: string,
  answer: string,
): Promise<void> {
  try {
    const redis = getRedis();
    if (!redis) return;
    const key = `working_memory:${userId}:${sessionId}`;
    await redis.rpush(key, `User: ${query}`, `Assistant: ${answer}`);
    await redis.ltrim(key, -10, -1);
    await redis.expire(key, WORKING_TTL);
  } catch {
    // Degrade silently
  }
}

// ─── Long-Term Memory (persistent user preferences) ──────────────────────────

export async function getLongTermMemory(userId: string): Promise<string | null> {
  try {
    const redis = getRedis();
    if (!redis) return null;
    const data = await redis.hgetall(`long_term_memory:${userId}`);
    if (!data || Object.keys(data).length === 0) return null;
    const parts: string[] = [];
    if (data.taste) parts.push(`Taste: ${data.taste}`);
    if (data.topics) parts.push(`Interests: ${data.topics}`);
    if (data.style) parts.push(`Preferred style: ${data.style}`);
    return parts.length > 0 ? parts.join(". ") : null;
  } catch {
    return null;
  }
}

const CACHE_TTL = 1800;
const MEMORY_MODEL = "gemini-2.5-flash";

const memoryInsightSchema = z.object({
  taste: z.string().optional(),
  topics: z.string().optional(),
  style: z.string().optional(),
});

let google: ReturnType<typeof createGoogleGenerativeAI> | undefined;

function getGoogle() {
  const apiKey = env.GEMINI_API_KEY ?? env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }
  google ??= createGoogleGenerativeAI({ apiKey });
  return google;
}

export async function updateLongTermMemory(
  userId: string,
  query: string,
  answer: string,
): Promise<void> {
  try {
    if (!env.GEMINI_API_KEY && !env.GOOGLE_GENERATIVE_AI_API_KEY) return;
    const redis = getRedis();
    if (!redis) return;

    const { output } = await generateText({
      model: getGoogle()(MEMORY_MODEL),
      prompt: `From this Q&A, extract 1-2 short insights about the user's taste, interests, or preferred response style.
Return ONLY a JSON object with optional fields: taste, topics, style. Values must be under 20 words each.
If nothing can be inferred, return an empty object.

Q: ${query}
A: ${answer}`,
      output: Output.object({ schema: memoryInsightSchema }),
    });

    if (Object.keys(output).length === 0) return;

    await redis.hset(`long_term_memory:${userId}`, {
      ...output,
      last_updated: new Date().toISOString(),
    });
  } catch {
    // Degrade silently
  }
}

// ─── LLM Response Cache (30min TTL) ──────────────────────────────────────────

function cacheKey(userId: string, query: string): string {
  const hash = createHash("sha256")
    .update(`${userId}:${query.trim().toLowerCase()}`)
    .digest("hex")
    .slice(0, 20);
  return `llm_cache:${userId}:${hash}`;
}

export async function checkLlmCache(
  userId: string,
  query: string,
): Promise<CachedRetrievalResult | null> {
  try {
    const redis = getRedis();
    if (!redis) return null;
    const cached = await redis.get(cacheKey(userId, query));
    if (!cached) return null;
    return JSON.parse(cached) as CachedRetrievalResult;
  } catch {
    return null;
  }
}

export async function setLlmCache(
  userId: string,
  query: string,
  result: CachedRetrievalResult,
): Promise<void> {
  try {
    const redis = getRedis();
    if (!redis) return;
    await redis.setex(cacheKey(userId, query), CACHE_TTL, JSON.stringify(result));
  } catch {
    // Degrade silently
  }
}

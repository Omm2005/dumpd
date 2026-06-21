import {
  createGoogleGenerativeAI,
  type GoogleEmbeddingModelOptions,
} from "@ai-sdk/google";
import { embed, embedMany, generateText, Output } from "ai";
import { z } from "zod";

import { env } from "@dumpd/env/server";

const GENERATION_MODEL = "gemini-2.5-flash";
const EMBEDDING_MODEL = "gemini-embedding-001";
const EMBEDDING_DIMENSIONS = 768;

const ENTITY_SYSTEM_INSTRUCTION = `You are an entity and relationship extractor. Given text, extract all named entities and relationships between them. Return ONLY valid JSON, no markdown, no explanation. Schema:
{
  entities: [{ name: string, type: 'person'|'concept'|'place'|'tool'|'event'|'org', description: string }],
  relations: [{ from: string, to: string, type: string, weight: number }]
}
Relation weight is a float 0-1 representing confidence.`;

const extractionSchema = z.object({
  entities: z.array(
    z.object({
      name: z.string().trim().min(1),
      type: z.enum(["person", "concept", "place", "tool", "event", "org"]),
      description: z.string(),
    }),
  ),
  relations: z.array(
    z.object({
      from: z.string().trim().min(1),
      to: z.string().trim().min(1),
      type: z.string().trim().min(1),
      weight: z.number().min(0).max(1),
    }),
  ),
});

export type EntityExtraction = z.infer<typeof extractionSchema>;

let google: ReturnType<typeof createGoogleGenerativeAI> | undefined;

function getGoogle() {
  const apiKey = env.GEMINI_API_KEY ?? env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }
  google ??= createGoogleGenerativeAI({ apiKey });
  return google;
}

function normalizeEmbedding(values: number[]) {
  const magnitude = Math.sqrt(
    values.reduce((sum, value) => sum + value * value, 0),
  );
  return magnitude === 0 ? values : values.map((value) => value / magnitude);
}

function embeddingOptions(
  taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY",
) {
  return {
    google: {
      taskType,
      outputDimensionality: EMBEDDING_DIMENSIONS,
    } satisfies GoogleEmbeddingModelOptions,
  };
}

function validateEmbedding(values: number[]) {
  if (values.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Expected a ${EMBEDDING_DIMENSIONS}-dimensional embedding, received ${values.length}.`,
    );
  }

  return normalizeEmbedding(values);
}

export async function embedDocuments(texts: string[]) {
  const output: number[][] = [];

  for (let start = 0; start < texts.length; start += 20) {
    const batch = texts.slice(start, start + 20);
    const { embeddings } = await embedMany({
      model: getGoogle().embedding(EMBEDDING_MODEL),
      values: batch,
      providerOptions: embeddingOptions("RETRIEVAL_DOCUMENT"),
    });
    output.push(...embeddings.map(validateEmbedding));
  }

  return output;
}

export async function embedQuery(text: string) {
  const { embedding } = await embed({
    model: getGoogle().embedding(EMBEDDING_MODEL),
    value: text,
    providerOptions: embeddingOptions("RETRIEVAL_QUERY"),
  });
  return validateEmbedding(embedding);
}

export async function generateJson(prompt: string) {
  const { output } = await generateText({
    model: getGoogle()(GENERATION_MODEL),
    prompt,
    output: Output.json(),
  });
  return output;
}

export async function generateAnswer(systemInstruction: string, prompt: string) {
  const { text } = await generateText({
    model: getGoogle()(GENERATION_MODEL),
    system: systemInstruction,
    prompt,
  });
  return text;
}

export async function extractEntitiesAndRelations(
  text: string,
): Promise<EntityExtraction> {
  try {
    const { output } = await generateText({
      model: getGoogle()(GENERATION_MODEL),
      system: ENTITY_SYSTEM_INSTRUCTION,
      prompt: text,
      output: Output.object({ schema: extractionSchema }),
    });
    return output;
  } catch (error) {
    throw new Error("Gemini returned invalid entity extraction JSON.", {
      cause: error,
    });
  }
}

import {
  GoogleGenerativeAI,
  TaskType,
  type Content,
} from "@google/generative-ai";
import { anthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";
import { z } from "zod";

import { env } from "@dumpd/env/server";

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

let client: GoogleGenerativeAI | undefined;

function getClient() {
  const apiKey = env.GEMINI_API_KEY ?? env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }
  client ??= new GoogleGenerativeAI(apiKey);
  return client;
}

function asContent(text: string): Content {
  return {
    role: "user",
    parts: [{ text }],
  };
}

function normalizeEmbedding(values: number[]) {
  const magnitude = Math.sqrt(
    values.reduce((sum, value) => sum + value * value, 0),
  );
  return magnitude === 0 ? values : values.map((value) => value / magnitude);
}

async function embedText(text: string, taskType: TaskType) {
  const apiKey = env.GEMINI_API_KEY ?? env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: asContent(text),
        taskType,
        outputDimensionality: 768,
      }),
    },
  );
  const payload = (await response.json()) as {
    embedding?: { values?: number[] };
    error?: { message?: string };
  };
  if (!response.ok) {
    throw new Error(
      payload.error?.message ??
        `Gemini embedding request failed (${response.status}).`,
    );
  }

  const values = payload.embedding?.values;
  if (!values || values.length !== 768) {
    throw new Error(
      `Expected a 768-dimensional embedding, received ${values?.length ?? 0}.`,
    );
  }

  return normalizeEmbedding(values);
}

export async function embedDocuments(texts: string[]) {
  const output: number[][] = [];

  for (let start = 0; start < texts.length; start += 20) {
    const batch = texts.slice(start, start + 20);
    const embeddings = await Promise.all(
      batch.map((text) => embedText(text, TaskType.RETRIEVAL_DOCUMENT)),
    );
    output.push(...embeddings);
  }

  return output;
}

export async function embedQuery(text: string) {
  return embedText(text, TaskType.RETRIEVAL_QUERY);
}

export async function generateJson(prompt: string) {
  if (env.ANTHROPIC_API_KEY) {
    const { text } = await generateText({
      model: anthropic("claude-haiku-4-5-20251001"),
      prompt,
    });
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]) as unknown;
  }

  const model = getClient().getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: {
      responseMimeType: "application/json",
    },
  });
  const response = await model.generateContent(prompt);
  return JSON.parse(response.response.text()) as unknown;
}

export async function generateAnswer(systemInstruction: string, prompt: string) {
  if (env.ANTHROPIC_API_KEY) {
    const { text } = await generateText({
      model: anthropic("claude-sonnet-4-6"),
      system: systemInstruction,
      prompt,
    });
    return text;
  }

  if (env.AI_GATEWAY_API_KEY) {
    const { text } = await generateText({
      model: "anthropic/claude-sonnet-4.6",
      system: systemInstruction,
      prompt,
    });
    return text;
  }

  const model = getClient().getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction,
  });
  const response = await model.generateContent(prompt);
  return response.response.text();
}

export async function extractEntitiesAndRelations(
  text: string,
): Promise<EntityExtraction> {
  if (env.ANTHROPIC_API_KEY) {
    const { text: responseText } = await generateText({
      model: anthropic("claude-sonnet-4-6"),
      system: ENTITY_SYSTEM_INSTRUCTION,
      prompt: text,
    });
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) return extractionSchema.parse(JSON.parse(jsonMatch[0]));
    } catch (error) {
      throw new Error("Claude returned invalid entity extraction JSON.", {
        cause: error,
      });
    }
  }

  const model = getClient().getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction: ENTITY_SYSTEM_INSTRUCTION,
    generationConfig: {
      responseMimeType: "application/json",
    },
  });
  const response = await model.generateContent(text);

  try {
    return extractionSchema.parse(JSON.parse(response.response.text()));
  } catch (error) {
    throw new Error("Gemini returned invalid entity extraction JSON.", {
      cause: error,
    });
  }
}

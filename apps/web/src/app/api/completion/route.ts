import { auth } from "@dumpd/auth";
import { env } from "@dumpd/env/server";
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
} from "ai";
import { headers } from "next/headers";
import { z } from "zod";

import { retrieve } from "@/lib/retrieval";
import type { ChatMessage } from "@/lib/chat-sources";
import {
  appendToWorkingMemory,
  getLongTermMemory,
  getWorkingMemory,
  updateLongTermMemory,
} from "@/lib/ai-memory";

export const maxDuration = 30;

const completionRequestSchema = z.object({
  messages: z.array(z.custom<ChatMessage>()).min(1),
  worldId: z.string().trim().min(1).max(100).optional(),
});

function latestUserText(messages: ChatMessage[]) {
  const message = [...messages]
    .reverse()
    .find((candidate) => candidate.role === "user");
  return (
    message?.parts
      .filter(
        (part): part is Extract<(typeof message.parts)[number], { type: "text" }> =>
          part.type === "text",
      )
      .map((part) => part.text)
      .join("\n")
      .trim() ?? ""
  );
}

export async function POST(request: Request) {
  if (!env.GEMINI_API_KEY && !env.GOOGLE_GENERATIVE_AI_API_KEY) {
    return new Response("Missing GEMINI_API_KEY.", {
      status: 500,
    });
  }

  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return new Response("Unauthorized.", { status: 401 });
  }

  const parsed = completionRequestSchema.safeParse(
    await request.json().catch(() => null),
  );

  if (!parsed.success) {
    return new Response(
      parsed.error.issues[0]?.message ?? "Invalid request.",
      { status: 400 },
    );
  }

  const query = latestUserText(parsed.data.messages);
  if (!query) {
    return new Response("A user query is required.", { status: 400 });
  }

  const userId = session.user.id;
  const sessionId = `${userId}:${new Date().toISOString().slice(0, 10)}`;

  const [workingMemory, longTermMemory] = await Promise.all([
    getWorkingMemory(userId, sessionId),
    getLongTermMemory(userId),
  ]);

  const result = await retrieve(query, userId, {
    worldId: parsed.data.worldId,
    workingMemory: workingMemory || undefined,
    longTermMemory: longTermMemory || undefined,
  });

  void appendToWorkingMemory(userId, sessionId, query, result.answer);
  void updateLongTermMemory(userId, query, result.answer);
  const stream = createUIMessageStream<ChatMessage>({
    execute: ({ writer }) => {
      const id = crypto.randomUUID();
      writer.write({ type: "text-start", id });
      writer.write({ type: "text-delta", id, delta: result.answer });
      writer.write({ type: "text-end", id });
      writer.write({
        type: "data-sources",
        data: result.sources,
      });
    },
  });

  return createUIMessageStreamResponse({
    stream,
    headers: { "Cache-Control": "no-store" },
  });
}

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

function recentConversation(messages: ChatMessage[]) {
  return messages
    .slice(-6, -1)
    .map((message) => {
      const text = message.parts
        .filter(
          (part): part is Extract<
            (typeof message.parts)[number],
            { type: "text" }
          > => part.type === "text",
        )
        .map((part) => part.text)
        .join("\n")
        .trim();
      return text ? `${message.role === "user" ? "User" : "Assistant"}: ${text}` : "";
    })
    .filter(Boolean)
    .join("\n");
}

export async function POST(request: Request) {
  if (
    !env.ANTHROPIC_API_KEY &&
    !env.AI_GATEWAY_API_KEY &&
    !env.GEMINI_API_KEY &&
    !env.GOOGLE_GENERATIVE_AI_API_KEY
  ) {
    return new Response("No language model API key is configured.", {
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

  const result = await retrieve(query, session.user.id, {
    worldId: parsed.data.worldId,
    conversationContext: recentConversation(parsed.data.messages),
  });
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

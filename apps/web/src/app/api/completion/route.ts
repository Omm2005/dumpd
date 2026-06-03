import { google } from "@ai-sdk/google";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { auth } from "@dumpd/auth";
import { env } from "@dumpd/env/server";
import { headers } from "next/headers";
import { z } from "zod";

export const maxDuration = 30;

const completionRequestSchema = z.object({
  messages: z.array(z.custom<UIMessage>()).min(1, "At least one message is required."),
});

export async function POST(request: Request) {
  if (!env.GOOGLE_GENERATIVE_AI_API_KEY) {
    return new Response("Missing GOOGLE_GENERATIVE_AI_API_KEY.", {
      status: 500,
    });
  }

  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return new Response("Unauthorized.", { status: 401 });
  }

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return new Response("Invalid JSON body.", { status: 400 });
  }

  const parsedPayload = completionRequestSchema.safeParse(payload);

  if (!parsedPayload.success) {
    return new Response(parsedPayload.error.issues[0]?.message ?? "Invalid request.", {
      status: 400,
    });
  }

  const result = streamText({
    model: google("gemini-2.5-flash"),
    system:
      "You are Dumpd AI. Give concise, practical answers about organizing and managing dumpd. At the very end of every final answer, append a hidden follow-up block in exactly this format: <<<FOLLOWUPS>>> followed by exactly 3 short follow-up questions, each on its own new line, each 2 to 4 words, with no numbering.",
    messages: await convertToModelMessages(parsedPayload.data.messages),
    providerOptions: {
      google: {
        thinkingConfig: {
          thinkingBudget: 1024,
          includeThoughts: true,
        },
      },
    },
  });

  return result.toUIMessageStreamResponse({
    sendReasoning: true,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

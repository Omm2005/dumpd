import { headers } from "next/headers";

import { auth } from "@dumpd/auth";
import { db } from "@dumpd/db";
import { sources } from "@dumpd/db/schema/ingestion";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { ingestSource } from "@/lib/ingestion/ingest-source";

export const runtime = "nodejs";

const requestSchema = z.object({
  sourceId: z.uuid(),
});

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json(
      { success: false, error: "Invalid JSON body." },
      { status: 400 },
    );
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid sourceId.",
      },
      { status: 400 },
    );
  }

  const { sourceId } = parsed.data;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return Response.json(
      { success: false, error: "Unauthorized." },
      { status: 401 },
    );
  }

  const [source] = await db
    .select({ sourceId: sources.sourceId })
    .from(sources)
    .where(
      and(
        eq(sources.sourceId, sourceId),
        eq(sources.userId, session.user.id),
      ),
    )
    .limit(1);
  if (!source) {
    return Response.json(
      { success: false, error: "Source not found." },
      { status: 404 },
    );
  }

  void ingestSource(sourceId);

  return Response.json({ success: true, sourceId });
}

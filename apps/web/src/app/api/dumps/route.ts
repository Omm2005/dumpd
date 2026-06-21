import { auth } from "@dumpd/auth";
import { db } from "@dumpd/db";
import { dumps } from "@dumpd/db/schema/dumps";
import { and, desc, eq } from "drizzle-orm";
import { headers } from "next/headers";

async function getUserId() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  return session?.user.id ?? null;
}

export async function GET(request: Request) {
  const userId = await getUserId();

  if (!userId) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const worldId = new URL(request.url).searchParams.get("worldId");

  if (!worldId) {
    return Response.json({ error: "World is required." }, { status: 400 });
  }

  const rows = await db
    .select({
      id: dumps.id,
      worldId: dumps.worldId,
      type: dumps.type,
      title: dumps.title,
      content: dumps.content,
      plainText: dumps.plainText,
      positionX: dumps.positionX,
      positionY: dumps.positionY,
      createdAt: dumps.createdAt,
      updatedAt: dumps.updatedAt,
    })
    .from(dumps)
    .where(and(eq(dumps.userId, userId), eq(dumps.worldId, worldId)))
    .orderBy(desc(dumps.createdAt));

  return Response.json({ dumps: rows });
}

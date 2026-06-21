import { auth } from "@dumpd/auth";
import { db } from "@dumpd/db";
import { dumps } from "@dumpd/db/schema/dumps";
import { embeddings, sources } from "@dumpd/db/schema/ingestion";
import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { z } from "zod";

import { deleteMedia, deletePhoto } from "@/lib/supabase-storage";
import { deleteVectors } from "@/lib/supabase-vectors";

const updatePositionSchema = z.object({
  position: z.object({
    x: z.number().finite(),
    y: z.number().finite(),
  }),
});

async function getUserId() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  return session?.user.id ?? null;
}

const returning = {
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
};

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getUserId();

  if (!userId) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id } = await params;

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsedPayload = updatePositionSchema.safeParse(payload);

  if (!parsedPayload.success) {
    return Response.json(
      { error: parsedPayload.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 },
    );
  }

  const [updated] = await db
    .update(dumps)
    .set({
      positionX: parsedPayload.data.position.x,
      positionY: parsedPayload.data.position.y,
    })
    .where(and(eq(dumps.id, id), eq(dumps.userId, userId)))
    .returning(returning);

  if (!updated) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  return Response.json({ dump: updated });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getUserId();

  if (!userId) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id } = await params;
  const [existing] = await db
    .select({ id: dumps.id, content: dumps.content })
    .from(dumps)
    .where(and(eq(dumps.id, id), eq(dumps.userId, userId)))
    .limit(1);

  if (!existing) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  const vectorRows = await db
    .select({ key: embeddings.vectorObjectPath })
    .from(embeddings)
    .where(
      and(eq(embeddings.sourceId, id), eq(embeddings.userId, userId)),
    );

  await db.transaction(async (tx) => {
    await tx
      .delete(sources)
      .where(and(eq(sources.sourceId, id), eq(sources.userId, userId)));
    await tx
      .delete(dumps)
      .where(and(eq(dumps.id, id), eq(dumps.userId, userId)));
  });

  const storagePath =
    typeof existing.content.storagePath === "string"
      ? existing.content.storagePath
      : null;
  const mediaStoragePath =
    typeof existing.content.mediaStoragePath === "string"
      ? existing.content.mediaStoragePath
      : null;
  const vectorKeys = vectorRows.flatMap(({ key }) => (key ? [key] : []));

  await Promise.allSettled([
    ...(storagePath ? [deletePhoto(storagePath)] : []),
    ...(mediaStoragePath ? [deleteMedia(mediaStoragePath)] : []),
    deleteVectors(vectorKeys),
  ]);

  return Response.json({ id });
}

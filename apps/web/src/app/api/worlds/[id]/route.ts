import { auth } from "@dumpd/auth";
import { db } from "@dumpd/db";
import { dumps } from "@dumpd/db/schema/dumps";
import { worlds } from "@dumpd/db/schema/worlds";
import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { z } from "zod";

import { deleteMedia, deletePhoto } from "@/lib/supabase-storage";

const updateNameSchema = z.object({
  name: z.string().trim().min(1, "World name is required.").max(60),
});

const updateColorSchema = z.object({
  color: z.enum(["amber", "sky", "rose", "emerald", "violet", "stone"]),
});

const updatePositionSchema = z.object({
  position: z.object({
    x: z.number().finite(),
    y: z.number().finite(),
  }),
});

const updateWorldSchema = z.union([
  updateNameSchema,
  updateColorSchema,
  updatePositionSchema,
]);

async function getUserId() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  return session?.user.id ?? null;
}

const returning = {
  id: worlds.id,
  name: worlds.name,
  isDefault: worlds.isDefault,
  color: worlds.color,
  positionX: worlds.positionX,
  positionY: worlds.positionY,
  createdAt: worlds.createdAt,
  updatedAt: worlds.updatedAt,
};

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getUserId();

  if (!userId) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsedPayload = updateWorldSchema.safeParse(payload);

  if (!parsedPayload.success) {
    return Response.json(
      { error: parsedPayload.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 },
    );
  }

  const updates =
    "position" in parsedPayload.data
      ? {
          positionX: parsedPayload.data.position.x,
          positionY: parsedPayload.data.position.y,
        }
      : "color" in parsedPayload.data
        ? { color: parsedPayload.data.color }
        : { name: parsedPayload.data.name };
  const { id } = await params;
  const [updated] = await db
    .update(worlds)
    .set(updates)
    .where(and(eq(worlds.id, id), eq(worlds.userId, userId)))
    .returning(returning);

  if (!updated) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  return Response.json({ world: updated });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getUserId();
  const { id } = await params;

  if (!userId) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const [world] = await db
    .select({ isDefault: worlds.isDefault })
    .from(worlds)
    .where(and(eq(worlds.id, id), eq(worlds.userId, userId)))
    .limit(1);

  if (!world) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  if (world.isDefault) {
    return Response.json(
      { error: "The default world cannot be deleted." },
      { status: 409 },
    );
  }

  const storedMediaRows = await db
    .select({ id: dumps.id, content: dumps.content })
    .from(dumps)
    .where(and(eq(dumps.worldId, id), eq(dumps.userId, userId)));
  const [deleted] = await db
    .delete(worlds)
    .where(and(eq(worlds.id, id), eq(worlds.userId, userId)))
    .returning({ id: worlds.id });

  if (!deleted) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  await Promise.allSettled(
    storedMediaRows.flatMap(({ content }) => {
      const deletions: Promise<void>[] = [];
      if (typeof content.storagePath === "string") {
        deletions.push(deletePhoto(content.storagePath));
      }
      if (typeof content.mediaStoragePath === "string") {
        deletions.push(deleteMedia(content.mediaStoragePath));
      }
      return deletions;
    }),
  );
  return Response.json({ id: deleted.id });
}

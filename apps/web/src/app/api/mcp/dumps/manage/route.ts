import { db } from "@dumpd/db";
import { dumps } from "@dumpd/db/schema/dumps";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { deleteMedia, deletePhoto } from "@/lib/supabase-storage";
import { retrieve } from "@/lib/retrieval";

import {
  getMcpUser,
  isAuthorizedMcpRequest,
  resolveWorld,
} from "../../_shared";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("get"), email: z.email(), id: z.string().min(1) }),
  z.object({
    action: z.literal("list"),
    email: z.email(),
    world: z.string().trim().min(1).max(100).optional(),
    limit: z.number().int().min(1).max(100).default(50),
  }),
  z.object({
    action: z.literal("update"),
    email: z.email(),
    id: z.string().min(1),
    title: z.string().trim().min(1).max(120).optional(),
    text: z.string().trim().min(1).max(100_000).optional(),
  }),
  z.object({
    action: z.literal("delete"),
    email: z.email(),
    id: z.string().min(1),
  }),
  z.object({
    action: z.literal("retrieve"),
    email: z.email(),
    query: z.string().trim().min(1).max(10_000),
    modality: z.array(z.string().trim().min(1)).max(20).optional(),
    limit: z.number().int().min(1).max(20).optional(),
    graphHops: z.number().int().min(1).max(5).optional(),
    dateFrom: z.iso.datetime().optional(),
    dateTo: z.iso.datetime().optional(),
  }),
]);

function noteDocument(text: string) {
  return {
    type: "doc",
    content: text.split(/\r?\n/).map((line) => ({
      type: "paragraph",
      content: line ? [{ type: "text", text: line }] : [],
    })),
  };
}

export async function POST(request: Request) {
  if (!isAuthorizedMcpRequest(request)) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 },
    );
  }

  const user = await getMcpUser(parsed.data.email);
  if (!user) return Response.json({ error: "User not found." }, { status: 404 });

  if (parsed.data.action === "retrieve") {
    return Response.json(
      await retrieve(parsed.data.query, user.id, {
        modality: parsed.data.modality,
        limit: parsed.data.limit,
        graphHops: parsed.data.graphHops,
        dateFrom: parsed.data.dateFrom
          ? new Date(parsed.data.dateFrom)
          : undefined,
        dateTo: parsed.data.dateTo ? new Date(parsed.data.dateTo) : undefined,
      }),
    );
  }

  if (parsed.data.action === "list") {
    const world = await resolveWorld(user.id, parsed.data.world);
    if (!world) return Response.json({ error: "World not found." }, { status: 404 });
    const rows = await db
      .select()
      .from(dumps)
      .where(and(eq(dumps.userId, user.id), eq(dumps.worldId, world.id)))
      .orderBy(desc(dumps.createdAt))
      .limit(parsed.data.limit);
    return Response.json({ dumps: rows, world });
  }

  const [existing] = await db
    .select()
    .from(dumps)
    .where(and(eq(dumps.id, parsed.data.id), eq(dumps.userId, user.id)))
    .limit(1);
  if (!existing) return Response.json({ error: "Not found." }, { status: 404 });

  if (parsed.data.action === "get") {
    return Response.json({ dump: existing });
  }

  if (parsed.data.action === "delete") {
    await db.delete(dumps).where(eq(dumps.id, existing.id));
    const storagePath =
      typeof existing.content.storagePath === "string"
        ? existing.content.storagePath
        : null;
    const mediaStoragePath =
      typeof existing.content.mediaStoragePath === "string"
        ? existing.content.mediaStoragePath
        : null;
    if (storagePath) await deletePhoto(storagePath).catch(() => undefined);
    if (mediaStoragePath) {
      await deleteMedia(mediaStoragePath).catch(() => undefined);
    }
    return Response.json({ id: existing.id });
  }

  const title = parsed.data.title ?? existing.title;
  const text = parsed.data.text ?? existing.plainText;
  const content =
    existing.type === "note" && parsed.data.text
      ? {
          ...noteDocument(text),
          source: "mcp",
          mcpEditable: true,
        }
      : {
          ...existing.content,
          ...(parsed.data.text ? { text: parsed.data.text } : {}),
          source: "mcp",
          mcpEditable: true,
        };

  const [updated] = await db
    .update(dumps)
    .set({ title, plainText: text, content })
    .where(eq(dumps.id, existing.id))
    .returning();

  if (!updated) throw new Error("Could not update dump.");

  return Response.json({ dump: updated });
}

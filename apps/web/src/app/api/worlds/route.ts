import { randomUUID } from "node:crypto";

import { auth } from "@dumpd/auth";
import { db } from "@dumpd/db";
import { dumps } from "@dumpd/db/schema/dumps";
import { worlds } from "@dumpd/db/schema/worlds";
import { asc, count, eq, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { z } from "zod";

const createWorldSchema = z.object({
  name: z.string().trim().min(1, "World name is required.").max(60),
  color: z
    .enum(["amber", "sky", "rose", "emerald", "violet", "stone"])
    .default("amber"),
});

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

export async function GET() {
  const userId = await getUserId();

  if (!userId) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  let rows = await db
    .select({
      ...returning,
      itemCount: count(dumps.id),
      itemTypes: sql<string[]>`
        coalesce(
          array_agg(distinct ${dumps.type}) filter (where ${dumps.id} is not null),
          '{}'
        )
      `,
    })
    .from(worlds)
    .leftJoin(dumps, eq(dumps.worldId, worlds.id))
    .where(eq(worlds.userId, userId))
    .groupBy(worlds.id)
    .orderBy(asc(worlds.createdAt));

  if (rows.length === 0) {
    const [created] = await db
      .insert(worlds)
      .values({
        id: randomUUID(),
        userId,
        name: "My World",
        isDefault: true,
      })
      .returning(returning);

    if (created) {
      rows = [{ ...created, itemCount: 0, itemTypes: [] }];
    }
  }

  return Response.json({ worlds: rows });
}

export async function POST(request: Request) {
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

  const parsedPayload = createWorldSchema.safeParse(payload);

  if (!parsedPayload.success) {
    return Response.json(
      { error: parsedPayload.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 },
    );
  }

  const [worldCount] = await db
    .select({ value: count() })
    .from(worlds)
    .where(eq(worlds.userId, userId));
  const index = worldCount?.value ?? 0;

  const [created] = await db
    .insert(worlds)
    .values({
      id: randomUUID(),
      userId,
      name: parsedPayload.data.name,
      color: parsedPayload.data.color,
      positionX: (index % 4) * 280,
      positionY: Math.floor(index / 4) * 210,
    })
    .returning(returning);

  return Response.json(
    {
      world: created
        ? { ...created, itemCount: 0, itemTypes: [] }
        : created,
    },
    { status: 201 },
  );
}

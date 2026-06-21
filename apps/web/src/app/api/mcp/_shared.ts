import { timingSafeEqual } from "node:crypto";

import { db } from "@dumpd/db";
import { user } from "@dumpd/db/schema/auth";
import { worlds } from "@dumpd/db/schema/worlds";
import { env } from "@dumpd/env/server";
import { and, asc, desc, eq, or, sql } from "drizzle-orm";

export function isAuthorizedMcpRequest(request: Request) {
  const configuredSecret = env.MCP_INGEST_SECRET;
  const authorization = request.headers.get("authorization");
  const suppliedSecret = authorization?.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";

  if (!configuredSecret || !suppliedSecret) {
    return false;
  }

  const configured = Buffer.from(configuredSecret);
  const supplied = Buffer.from(suppliedSecret);

  return (
    configured.length === supplied.length && timingSafeEqual(configured, supplied)
  );
}

export async function getMcpUser(email: string) {
  const [matchedUser] = await db
    .select({ id: user.id, email: user.email })
    .from(user)
    .where(sql`lower(${user.email}) = lower(${email})`)
    .limit(1);

  return matchedUser;
}

export async function resolveWorld(userId: string, worldReference?: string) {
  if (worldReference) {
    const [matchedWorld] = await db
      .select({
        id: worlds.id,
        name: worlds.name,
        isDefault: worlds.isDefault,
      })
      .from(worlds)
      .where(
        and(
          eq(worlds.userId, userId),
          or(
            eq(worlds.id, worldReference),
            sql`lower(${worlds.name}) = lower(${worldReference})`,
          ),
        ),
      )
      .limit(1);

    return matchedWorld;
  }

  const [existingWorld] = await db
    .select({
      id: worlds.id,
      name: worlds.name,
      isDefault: worlds.isDefault,
    })
    .from(worlds)
    .where(eq(worlds.userId, userId))
    .orderBy(desc(worlds.isDefault), asc(worlds.createdAt))
    .limit(1);

  if (existingWorld) {
    return existingWorld;
  }

  const [createdWorld] = await db
    .insert(worlds)
    .values({
      id: crypto.randomUUID(),
      userId,
      name: "My World",
      isDefault: true,
    })
    .returning({
      id: worlds.id,
      name: worlds.name,
      isDefault: worlds.isDefault,
    });

  return createdWorld;
}

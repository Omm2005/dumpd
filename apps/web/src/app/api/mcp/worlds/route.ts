import { db } from "@dumpd/db";
import { worlds } from "@dumpd/db/schema/worlds";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";

import {
  getMcpUser,
  isAuthorizedMcpRequest,
  resolveWorld,
} from "../_shared";

const requestSchema = z.object({
  email: z.email(),
});

export async function POST(request: Request) {
  if (!isAuthorizedMcpRequest(request)) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(payload);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 },
    );
  }

  const matchedUser = await getMcpUser(parsed.data.email);
  if (!matchedUser) {
    return Response.json({ error: "dumpd user not found." }, { status: 404 });
  }

  await resolveWorld(matchedUser.id);

  const rows = await db
    .select({
      id: worlds.id,
      name: worlds.name,
      isDefault: worlds.isDefault,
      color: worlds.color,
    })
    .from(worlds)
    .where(eq(worlds.userId, matchedUser.id))
    .orderBy(asc(worlds.createdAt));

  return Response.json({ worlds: rows });
}

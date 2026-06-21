import { auth } from "@dumpd/auth";
import { db } from "@dumpd/db";
import { dumps } from "@dumpd/db/schema/dumps";
import { and, eq, inArray } from "drizzle-orm";
import { headers } from "next/headers";

import { downloadPhoto } from "@/lib/supabase-storage";

async function getUserId() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  return session?.user.id ?? null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getUserId();

  if (!userId) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id } = await params;
  const [media] = await db
    .select({ content: dumps.content })
    .from(dumps)
    .where(
      and(
        eq(dumps.id, id),
        eq(dumps.userId, userId),
        inArray(dumps.type, ["photo", "music", "article", "link"]),
      ),
    )
    .limit(1);
  const storagePath =
    media && typeof media.content.storagePath === "string"
      ? media.content.storagePath
      : null;

  if (!storagePath) {
    return Response.json({ error: "Photo not found." }, { status: 404 });
  }

  try {
    const file = await downloadPhoto(storagePath);

    return new Response(file.body, {
      headers: {
        "Cache-Control": "private, max-age=3600",
        "Content-Type":
          file.headers.get("content-type") ?? "application/octet-stream",
      },
    });
  } catch {
    return Response.json({ error: "Photo not found." }, { status: 404 });
  }
}

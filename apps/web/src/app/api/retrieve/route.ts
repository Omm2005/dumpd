import { headers } from "next/headers";

import { auth } from "@dumpd/auth";
import { z } from "zod";

import { retrieve } from "@/lib/retrieval";

export const maxDuration = 30;
export const runtime = "nodejs";

const requestSchema = z.object({
  query: z.string().trim().min(1).max(10_000),
  userId: z.string().trim().min(1),
  modality: z.array(z.string().trim().min(1)).max(20).optional(),
  limit: z.number().int().min(1).max(20).optional(),
  graphHops: z.number().int().min(1).max(5).optional(),
  dateFrom: z.iso.datetime().optional(),
  dateTo: z.iso.datetime().optional(),
});

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const parsed = requestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 },
    );
  }
  if (parsed.data.userId !== session.user.id) {
    return Response.json({ error: "Forbidden." }, { status: 403 });
  }

  return Response.json(
    await retrieve(parsed.data.query, session.user.id, {
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

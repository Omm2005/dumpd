import { randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import { db } from "@dumpd/db";
import { dumps } from "@dumpd/db/schema/dumps";
import { sources } from "@dumpd/db/schema/ingestion";
import { and, count, eq } from "drizzle-orm";
import { z } from "zod";

import { ingestSource } from "@/lib/ingestion/ingest-source";
import {
  deleteMedia,
  deletePhoto,
  uploadMedia,
  uploadPhoto,
} from "@/lib/supabase-storage";

import {
  getMcpUser,
  isAuthorizedMcpRequest,
  resolveWorld,
} from "../_shared";

const commonSchema = z.object({
  email: z.email(),
  world: z.string().trim().min(1).max(100).optional(),
  title: z.string().trim().min(1).max(120).optional(),
  reaction: z.string().trim().max(500).optional(),
});

const publicUrlSchema = z
  .url()
  .refine((value) => ["http:", "https:"].includes(new URL(value).protocol), {
    message: "URL must use HTTP or HTTPS.",
  });

const requestSchema = z.discriminatedUnion("type", [
  commonSchema.extend({
    type: z.literal("note"),
    text: z.string().trim().min(1).max(50_000),
  }),
  commonSchema.extend({
    type: z.literal("image"),
    url: publicUrlSchema,
    text: z.string().trim().min(1).max(50_000),
  }),
  commonSchema.extend({
    type: z.literal("link"),
    url: publicUrlSchema,
    imageUrl: publicUrlSchema.optional(),
    description: z.string().trim().max(2_000).optional(),
    notes: z.string().trim().max(10_000).optional(),
    text: z.string().trim().min(1).max(50_000),
  }),
  commonSchema.extend({
    type: z.literal("music"),
    url: publicUrlSchema,
    artist: z.string().trim().min(1).max(200).optional(),
    album: z.string().trim().min(1).max(200).optional(),
    coverUrl: publicUrlSchema.optional(),
    previewUrl: publicUrlSchema.optional(),
    lyrics: z.string().trim().max(20_000).optional(),
    durationSeconds: z.number().positive().max(86_400).optional(),
    releaseYear: z.number().int().min(1000).max(3000).optional(),
    genre: z.string().trim().min(1).max(120).optional(),
    notes: z.string().trim().max(5_000).optional(),
    text: z.string().trim().min(1).max(50_000),
  }),
  commonSchema.extend({
    type: z.literal("video"),
    url: publicUrlSchema,
    text: z.string().trim().min(1).max(50_000),
  }),
  commonSchema.extend({
    type: z.literal("pdf"),
    url: publicUrlSchema,
    text: z.string().trim().min(1).max(50_000),
  }),
]);

const allowedImageTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);
const maxImageBytes = 10 * 1024 * 1024;
const allowedVideoTypes = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime",
]);
const maxVideoBytes = 100 * 1024 * 1024;

function deriveTitle(value: string, fallback: string) {
  const firstLine = value.split(/\r?\n/, 1)[0]?.trim();
  return (firstLine || fallback).slice(0, 120);
}

function noteDocument(text: string) {
  return {
    type: "doc",
    content: text.split(/\r?\n/).map((line) => ({
      type: "paragraph",
      content: line ? [{ type: "text", text: line }] : [],
    })),
  };
}

function isPrivateIpAddress(ip: string) {
  if (ip === "127.0.0.1" || ip === "::1") {
    return true;
  }

  if (ip.startsWith("10.")) return true;
  if (ip.startsWith("192.168.")) return true;
  if (ip.startsWith("169.254.")) return true;

  if (ip.startsWith("172.")) {
    const secondOctet = Number(ip.split(".")[1]);
    return secondOctet >= 16 && secondOctet <= 31;
  }

  if (ip.startsWith("fc") || ip.startsWith("fd")) {
    return true;
  }

  return false;
}

async function downloadImage(imageUrl: string) {
  const url = new URL(imageUrl);

  if (url.hostname === "localhost" || url.hostname.endsWith(".local")) {
    throw new Error("Image URL must not point to a local host.");
  }

  if (isIP(url.hostname)) {
    if (isPrivateIpAddress(url.hostname)) {
      throw new Error("Image URL must not point to a private address.");
    }
  } else {
    const resolved = await lookup(url.hostname, { all: true });
    for (const record of resolved) {
      if (isPrivateIpAddress(record.address)) {
        throw new Error("Image URL resolved to a private address.");
      }
    }
  }

  const response = await fetch(imageUrl, {
    headers: { Accept: "image/*" },
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(`Could not download image (${response.status}).`);
  }

  const contentType = response.headers.get("content-type")?.split(";")[0]?.trim();
  if (!contentType || !allowedImageTypes.has(contentType)) {
    throw new Error("The supplied URL did not return a supported image type.");
  }

  const contentLength = Number(response.headers.get("content-length") ?? "0");
  if (contentLength > maxImageBytes) {
    throw new Error("Image is larger than the 10 MB upload limit.");
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > maxImageBytes) {
    throw new Error("Image is larger than the 10 MB upload limit.");
  }

  return { bytes, contentType };
}

async function downloadVideo(videoUrl: string) {
  const url = new URL(videoUrl);

  if (url.hostname === "localhost" || url.hostname.endsWith(".local")) {
    throw new Error("Video URL must not point to a local host.");
  }

  if (isIP(url.hostname)) {
    if (isPrivateIpAddress(url.hostname)) {
      throw new Error("Video URL must not point to a private address.");
    }
  } else {
    const resolved = await lookup(url.hostname, { all: true });
    for (const record of resolved) {
      if (isPrivateIpAddress(record.address)) {
        throw new Error("Video URL resolved to a private address.");
      }
    }
  }

  const response = await fetch(videoUrl, {
    headers: { Accept: "video/*" },
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(`Could not download video (${response.status}).`);
  }

  const contentType = response.headers.get("content-type")?.split(";")[0]?.trim();
  if (!contentType || !allowedVideoTypes.has(contentType)) {
    throw new Error("The supplied URL did not return a supported video type.");
  }

  const contentLength = Number(response.headers.get("content-length") ?? "0");
  if (contentLength > maxVideoBytes) {
    throw new Error("Video is larger than the 100 MB upload limit.");
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > maxVideoBytes) {
    throw new Error("Video is larger than the 100 MB upload limit.");
  }

  return { bytes, contentType };
}

function extensionForMimeType(mimeType: string) {
  switch (mimeType) {
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    case "video/webm":
      return "webm";
    case "video/quicktime":
      return "mov";
    case "video/mp4":
      return "mp4";
    default:
      return "jpg";
  }
}

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
    return Response.json(
      {
        error:
          "No dumpd account matches the authenticated Google email. Sign in to dumpd once, then retry.",
      },
      { status: 404 },
    );
  }

  const world = await resolveWorld(matchedUser.id, parsed.data.world);
  if (!world) {
    return Response.json(
      {
        error: parsed.data.world
          ? `World "${parsed.data.world}" was not found.`
          : "Could not resolve a default world.",
      },
      { status: parsed.data.world ? 404 : 500 },
    );
  }

  const [dumpCount] = await db
    .select({ value: count() })
    .from(dumps)
    .where(
      and(eq(dumps.userId, matchedUser.id), eq(dumps.worldId, world.id)),
    );
  const index = dumpCount?.value ?? 0;

  let normalized: {
    type: "note" | "photo" | "article" | "music" | "video" | "document";
    title: string;
    content: Record<string, unknown>;
    plainText: string;
  };
  let uploadedStoragePath: string | null = null;
  let uploadedMediaStoragePath: string | null = null;

  try {
    if (parsed.data.type === "note") {
      normalized = {
        type: "note",
        title:
          parsed.data.title ?? deriveTitle(parsed.data.text, "Untitled note"),
        content: noteDocument(parsed.data.text),
        plainText: parsed.data.text,
      };
    } else if (parsed.data.type === "image") {
      const id = randomUUID();
      const { bytes, contentType } = await downloadImage(parsed.data.url);
      const storagePath = `${matchedUser.id}/${world.id}/${id}.${extensionForMimeType(contentType)}`;
      const file = new File([bytes], `${id}.${extensionForMimeType(contentType)}`, {
        type: contentType,
      });
      const uploaded = await uploadPhoto(storagePath, file);
      uploadedStoragePath = uploaded.storagePath;

      normalized = {
        type: "photo",
        title:
          parsed.data.title ?? deriveTitle(parsed.data.text, "Saved image"),
        content: {
          type: "photo",
          url: uploaded.publicUrl,
          storagePath: uploaded.storagePath,
          sourceUrl: parsed.data.url,
          caption: parsed.data.text,
          altText: parsed.data.text,
          mimeType: contentType,
          size: bytes.byteLength,
          source: "mcp",
        },
        plainText: parsed.data.text,
      };
    } else if (parsed.data.type === "link") {
      let storedPreview:
        | { storagePath: string; publicUrl: string; mimeType: string }
        | undefined;

      if (parsed.data.imageUrl) {
        try {
          const id = randomUUID();
          const { bytes, contentType } = await downloadImage(
            parsed.data.imageUrl,
          );
          const extension = extensionForMimeType(contentType);
          const storagePath = `${matchedUser.id}/${world.id}/${id}.${extension}`;
          const file = new File([bytes], `${id}.${extension}`, {
            type: contentType,
          });
          const uploaded = await uploadPhoto(storagePath, file);
          uploadedStoragePath = uploaded.storagePath;
          storedPreview = { ...uploaded, mimeType: contentType };
        } catch {
          // Preserve the source preview URL when copying it fails.
        }
      }

      normalized = {
        type: "article",
        title:
          parsed.data.title ??
          deriveTitle(
            parsed.data.description ?? new URL(parsed.data.url).hostname,
            "Saved link",
          ),
        content: {
          type: "link",
          url: parsed.data.url,
          imageUrl: storedPreview?.publicUrl ?? parsed.data.imageUrl,
          storagePath: storedPreview?.storagePath,
          previewMimeType: storedPreview?.mimeType,
          sourceImageUrl: parsed.data.imageUrl,
          text: parsed.data.text,
          description: parsed.data.description,
          notes: parsed.data.notes,
          source: "mcp",
        },
        plainText: [
          parsed.data.text,
          parsed.data.description,
          parsed.data.notes,
        ]
          .filter(Boolean)
          .join("\n\n"),
      };
    } else if (parsed.data.type === "music") {
      let storedCover:
        | { storagePath: string; publicUrl: string; mimeType: string }
        | undefined;

      if (parsed.data.coverUrl) {
        try {
          const id = randomUUID();
          const { bytes, contentType } = await downloadImage(
            parsed.data.coverUrl,
          );
          const extension = extensionForMimeType(contentType);
          const storagePath = `${matchedUser.id}/${world.id}/${id}.${extension}`;
          const file = new File([bytes], `${id}.${extension}`, {
            type: contentType,
          });
          const uploaded = await uploadPhoto(storagePath, file);
          uploadedStoragePath = uploaded.storagePath;
          storedCover = { ...uploaded, mimeType: contentType };
        } catch {
          // Keep the source cover URL. The canvas has a visual fallback if it
          // cannot be displayed, and a failed cover copy should not lose music.
        }
      }

      const sourceHost = new URL(parsed.data.url).hostname.replace(/^www\./, "");
      const musicTitle =
        parsed.data.title ??
        parsed.data.album ??
        parsed.data.artist ??
        `Music from ${sourceHost}`;

      normalized = {
        type: "music",
        title: musicTitle,
        content: {
          type: "music",
          url: parsed.data.url,
          artist: parsed.data.artist,
          album: parsed.data.album,
          coverUrl: storedCover?.publicUrl ?? parsed.data.coverUrl,
          coverStoragePath: storedCover?.storagePath,
          storagePath: storedCover?.storagePath,
          coverMimeType: storedCover?.mimeType,
          sourceCoverUrl: parsed.data.coverUrl,
          previewUrl: parsed.data.previewUrl,
          lyrics: parsed.data.lyrics,
          durationSeconds: parsed.data.durationSeconds,
          releaseYear: parsed.data.releaseYear,
          genre: parsed.data.genre,
          notes: parsed.data.notes,
          provider: sourceHost,
          source: "mcp",
        },
        plainText: parsed.data.text,
      };
    } else if (parsed.data.type === "video") {
      const id = randomUUID();
      const { bytes, contentType } = await downloadVideo(parsed.data.url);
      const extension = extensionForMimeType(contentType);
      const storagePath = `${matchedUser.id}/${world.id}/${id}.${extension}`;
      const file = new File([bytes], `${id}.${extension}`, {
        type: contentType,
      });
      const uploaded = await uploadMedia(storagePath, file);
      uploadedMediaStoragePath = uploaded.storagePath;

      normalized = {
        type: "video",
        title: parsed.data.title ?? deriveTitle(parsed.data.text, "Saved video"),
        content: {
          type: "video",
          url: uploaded.publicUrl,
          mediaStoragePath: uploaded.storagePath,
          sourceUrl: parsed.data.url,
          mimeType: contentType,
          size: bytes.byteLength,
          text: parsed.data.text,
          source: "mcp",
        },
        plainText: parsed.data.text,
      };
    } else {
      normalized = {
        type: "document",
        title:
          parsed.data.title ??
          deriveTitle(parsed.data.text, "Saved PDF"),
        content: {
          type: parsed.data.type,
          url: parsed.data.url,
          text: parsed.data.text,
          source: "mcp",
        },
        plainText: parsed.data.text,
      };
    }

    normalized.content = {
      ...normalized.content,
      reaction: parsed.data.reaction,
      source: "mcp",
      mcpEditable: true,
    };
    if (parsed.data.reaction) {
      normalized.plainText = `${normalized.plainText}\n\nUser reaction: ${parsed.data.reaction}`;
    }

    const dumpId = randomUUID();
    const [created] = await db
      .insert(dumps)
      .values({
        id: dumpId,
        userId: matchedUser.id,
        worldId: world.id,
        ...normalized,
        positionX: (index % 3) * 320,
        positionY: Math.floor(index / 3) * 220,
      })
      .returning({
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
      });

    if (!created) throw new Error("Could not create dump.");

    try {
      const sourceType = (
        parsed.data.type === "music"
          ? "audio"
          : parsed.data.type === "reel"
            ? "video"
            : parsed.data.type === "instagram"
              ? "image"
              : parsed.data.type
      ) as "pdf" | "note" | "image" | "video" | "audio" | "link";
      const contentUrl =
        typeof normalized.content.url === "string"
          ? normalized.content.url
          : null;
      const filePath =
        typeof normalized.content.mediaStoragePath === "string"
          ? normalized.content.mediaStoragePath
          : typeof normalized.content.storagePath === "string"
            ? normalized.content.storagePath
            : null;
      const mimeType =
        typeof normalized.content.mimeType === "string"
          ? normalized.content.mimeType
          : typeof normalized.content.coverMimeType === "string"
            ? normalized.content.coverMimeType
            : null;

      await db.insert(sources).values({
        sourceId: dumpId,
        userId: matchedUser.id,
        type: sourceType,
        title: normalized.title,
        filePath,
        url: contentUrl,
        mimeType,
        rawText: normalized.plainText,
        reaction: parsed.data.reaction,
      });
      void ingestSource(dumpId);
    } catch (ingestionError) {
      console.error(
        `Could not start knowledge ingestion for dump ${dumpId}.`,
        ingestionError,
      );
    }

    return Response.json(
      {
        dump: created,
        world: {
          id: world.id,
          name: world.name,
          isDefault: world.isDefault,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    if (uploadedStoragePath) {
      await deletePhoto(uploadedStoragePath).catch(() => undefined);
    }
    if (uploadedMediaStoragePath) {
      await deleteMedia(uploadedMediaStoragePath).catch(() => undefined);
    }

    return Response.json(
      {
        error: error instanceof Error ? error.message : "Could not save the item.",
      },
      { status: 500 },
    );
  }
}

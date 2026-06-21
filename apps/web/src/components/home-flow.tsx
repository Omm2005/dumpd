"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  MiniMap,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type ReactFlowInstance,
  type Edge,
  type Node,
  type NodeMouseHandler,
  type NodeProps,
} from "@xyflow/react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@dumpd/ui/components/dialog";
import { Input } from "@dumpd/ui/components/input";
import {
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Layers,
  Link2,
  Loader2,
  MoreHorizontal,
  Music2,
  Play,
  Search,
  Trash2,
} from "lucide-react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";

import { authClient } from "@/lib/auth-client";
import { SOURCE_FOCUS_EVENT } from "@/lib/chat-sources";
import { tiptapToMarkdown } from "@/lib/tiptap-to-markdown";
import {
  WorldSwitcher,
  worldColors,
  type WorldColor,
  type WorldRecord,
} from "@/components/world-switcher";

import "@xyflow/react/dist/style.css";

const initialNodes: Node[] = [];
const initialEdges: Edge[] = [];

const dumpTypeColors: Record<string, string> = {
  note: "#f59e0b",
  article: "#0ea5e9",
  photo: "#ec4899",
  image: "#ec4899",
  music: "#8b5cf6",
  video: "#ef4444",
  document: "#10b981",
};

const worldTypeColors: Record<WorldColor, string> = {
  amber: "#efc995",
  sky: "#9dcee6",
  rose: "#e9abb4",
  emerald: "#9ed0b8",
  violet: "#c0afe2",
  stone: "#c5bfb8",
};

type DumpRecord = {
  id: string;
  worldId: string;
  type: string;
  title: string;
  content: Record<string, unknown>;
  plainText: string;
  positionX: number;
  positionY: number;
  createdAt: string;
  updatedAt: string;
};

function getDumpTypeColor(type?: string) {
  const key = type?.toLowerCase() || "note";
  return dumpTypeColors[key] || dumpTypeColors.note;
}

function getNodePosition(index: number) {
  return {
    x: (index % 3) * 320,
    y: Math.floor(index / 3) * 220,
  };
}

function dumpToNode(dump: DumpRecord, index: number): Node {
  const dumpContent = dump.content as Record<string, unknown>;
  const dumpType = dump.type.toLowerCase();
  const nodeType =
    dumpType === "photo" || dumpType === "image"
      ? "image"
      : dumpType === "article" || dumpType === "link"
        ? "link"
        : dumpType === "document" || dumpType === "pdf"
          ? "pdf"
          : dumpType === "video"
            ? "video"
            : dumpType === "music"
              ? "music"
              : "note";

  return {
    id: dump.id,
    type: nodeType,
    position: {
      x: dump.positionX ?? getNodePosition(index).x,
      y: dump.positionY ?? getNodePosition(index).y,
    },
    data: {
      id: dump.id,
      type: dump.type,
      title: dump.title,
      markdown: tiptapToMarkdown(dump.content),
      preview: dump.plainText,
      imageUrl:
        (dumpType === "photo" || dumpType === "image") &&
        (typeof dumpContent.storagePath === "string" ||
          typeof dumpContent.url === "string")
          ? `/api/photos/${dump.id}`
          : undefined,
      coverUrl: dumpType === "music"
        ? typeof dumpContent.storagePath === "string"
          ? `/api/photos/${dump.id}`
          : typeof dumpContent.coverUrl === "string"
            ? dumpContent.coverUrl
            : undefined
        : undefined,
      sourceUrl:
        typeof dumpContent.url === "string" ? dumpContent.url : undefined,
      linkImageUrl:
        (dumpType === "article" || dumpType === "link") &&
        typeof dumpContent.storagePath === "string"
          ? `/api/photos/${dump.id}`
          : typeof dumpContent.imageUrl === "string"
          ? dumpContent.imageUrl
          : undefined,
      previewUrl:
        typeof dumpContent.previewUrl === "string"
          ? dumpContent.previewUrl
          : undefined,
      artist:
        typeof dumpContent.artist === "string" ? dumpContent.artist : undefined,
      album:
        typeof dumpContent.album === "string" ? dumpContent.album : undefined,
      lyrics:
        typeof dumpContent.lyrics === "string" ? dumpContent.lyrics : undefined,
      notes:
        typeof dumpContent.notes === "string" ? dumpContent.notes : undefined,
      description:
        typeof dumpContent.description === "string"
          ? dumpContent.description
          : undefined,
      genre:
        typeof dumpContent.genre === "string" ? dumpContent.genre : undefined,
      releaseYear:
        typeof dumpContent.releaseYear === "number"
          ? dumpContent.releaseYear
          : undefined,
      durationSeconds:
        typeof dumpContent.durationSeconds === "number"
          ? dumpContent.durationSeconds
          : undefined,
      createdAt: dump.createdAt,
    },
  };
}

type DumpNodeData = {
  id?: string;
  type?: string;
  title?: string;
  markdown?: string;
  preview?: string;
  imageUrl?: string;
  coverUrl?: string;
  sourceUrl?: string;
  linkImageUrl?: string;
  previewUrl?: string;
  artist?: string;
  album?: string;
  lyrics?: string;
  notes?: string;
  description?: string;
  genre?: string;
  releaseYear?: number;
  durationSeconds?: number;
  createdAt?: string;
};

function getMusicEmbedUrl(sourceUrl?: string) {
  if (!sourceUrl) return undefined;

  try {
    const url = new URL(sourceUrl);
    const host = url.hostname.replace(/^www\./, "");

    if (host === "open.spotify.com") {
      const match = url.pathname.match(
        /^\/(track|album|playlist|episode|show)\/([a-zA-Z0-9]+)/,
      );
      return match
        ? `https://open.spotify.com/embed/${match[1]}/${match[2]}?utm_source=generator&theme=0`
        : undefined;
    }

    if (host === "music.apple.com") {
      return `https://embed.music.apple.com${url.pathname}${url.search}`;
    }

    if (host === "youtu.be") {
      const videoId = url.pathname.split("/").filter(Boolean)[0];
      return videoId
        ? `https://www.youtube-nocookie.com/embed/${videoId}`
        : undefined;
    }

    if (host === "youtube.com" || host === "m.youtube.com") {
      const videoId =
        url.searchParams.get("v") ??
        url.pathname.match(/^\/(?:shorts|embed)\/([^/]+)/)?.[1];
      return videoId
        ? `https://www.youtube-nocookie.com/embed/${videoId}`
        : undefined;
    }

    if (host === "soundcloud.com") {
      return `https://w.soundcloud.com/player/?url=${encodeURIComponent(
        sourceUrl,
      )}&color=%238b5cf6&auto_play=false&hide_related=true&show_comments=false&show_user=true&show_reposts=false`;
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function getVideoEmbedUrl(sourceUrl?: string) {
  if (!sourceUrl) return undefined;

  try {
    const url = new URL(sourceUrl);
    const host = url.hostname.replace(/^www\./, "");

    if (host === "youtu.be") {
      const videoId = url.pathname.split("/").filter(Boolean)[0];
      return videoId
        ? `https://www.youtube-nocookie.com/embed/${videoId}`
        : undefined;
    }

    if (host === "youtube.com" || host === "m.youtube.com") {
      const videoId =
        url.searchParams.get("v") ??
        url.pathname.match(/^\/(?:shorts|embed)\/([^/]+)/)?.[1];
      return videoId
        ? `https://www.youtube-nocookie.com/embed/${videoId}`
        : undefined;
    }

    if (host === "vimeo.com") {
      const videoId = url.pathname.split("/").filter(Boolean)[0];
      return videoId ? `https://player.vimeo.com/video/${videoId}` : undefined;
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function getUrlHost(sourceUrl?: string) {
  if (!sourceUrl) return undefined;

  try {
    return new URL(sourceUrl).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

function getFaviconUrl(sourceUrl?: string) {
  if (!sourceUrl) return undefined;

  try {
    return new URL("/favicon.ico", sourceUrl).toString();
  } catch {
    return undefined;
  }
}

const folderColorClasses: Record<
  WorldColor,
  { back: string; front: string; border: string; backHex: string; borderHex: string }
> = {
  amber: {
    back: "bg-[#f3d7af]",
    front: "bg-[#efc995]",
    border: "border-[#d7b98e]",
    backHex: "#f3d7af",
    borderHex: "#d7b98e",
  },
  sky: {
    back: "bg-[#bcdced]",
    front: "bg-[#9dcee6]",
    border: "border-[#83b7d0]",
    backHex: "#bcdced",
    borderHex: "#83b7d0",
  },
  rose: {
    back: "bg-[#efc5ca]",
    front: "bg-[#e9abb4]",
    border: "border-[#cf939c]",
    backHex: "#efc5ca",
    borderHex: "#cf939c",
  },
  emerald: {
    back: "bg-[#bde0cf]",
    front: "bg-[#9ed0b8]",
    border: "border-[#82b69e]",
    backHex: "#bde0cf",
    borderHex: "#82b69e",
  },
  violet: {
    back: "bg-[#d4c8ec]",
    front: "bg-[#c0afe2]",
    border: "border-[#a393c7]",
    backHex: "#d4c8ec",
    borderHex: "#a393c7",
  },
  stone: {
    back: "bg-[#d8d4cf]",
    front: "bg-[#c5bfb8]",
    border: "border-[#aaa39b]",
    backHex: "#d8d4cf",
    borderHex: "#aaa39b",
  },
};

function worldToNode(
  world: WorldRecord,
  index: number,
  onColorChange: (worldId: string, color: WorldColor) => void,
  onNameChange: (worldId: string, name: string) => void,
): Node {
  return {
    id: world.id,
    type: "world",
    position: {
      x: world.positionX ?? (index % 4) * 280,
      y: world.positionY ?? Math.floor(index / 4) * 210,
    },
    data: {
      id: world.id,
      name: world.name,
      color: world.color,
      minimapColor: worldTypeColors[world.color],
      itemCount: world.itemCount,
      itemTypes: world.itemTypes,
      onColorChange,
      onNameChange,
    },
  };
}

function WorldNode({ data }: NodeProps) {
  const [showColors, setShowColors] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [name, setName] = useState("");
  const world = data as {
    id?: string;
    name?: string;
    color?: WorldColor;
    itemCount?: number;
    itemTypes?: string[];
    onColorChange?: (worldId: string, color: WorldColor) => void;
    onNameChange?: (worldId: string, name: string) => void;
  };
  const itemCount = world.itemCount ?? 0;
  const color = world.color ?? "amber";
  const colors = folderColorClasses[color];
  const itemTypes = world.itemTypes ?? [];
  const previewCount =
    itemCount === 0 ? 0 : Math.min(Math.max(itemCount, 4), 6);
  const previewFallbacks = ["note", "photo", "article", "music"] as const;
  const previewTypes = Array.from(
    { length: previewCount },
    (_, index) =>
      itemTypes[index] ??
      previewFallbacks[index % previewFallbacks.length]!,
  );

  function PreviewCard({
    type,
    className,
  }: {
    type: string;
    className: string;
  }) {
    const isImage = ["image", "photo"].includes(type);
    const isArticle = type === "article";
    const isMusic = ["music", "audio", "song"].includes(type);

    return (
      <div
        className={`absolute overflow-hidden rounded-[1.35rem] border-[5px] border-white/95 bg-[#faf8f4] p-3 shadow-[0_10px_22px_rgba(0,0,0,0.15)] transition-transform duration-200 ${className}`}
      >
        {isMusic ? (
          <div className="relative h-full overflow-hidden rounded-[0.9rem] bg-[linear-gradient(145deg,#29233f_0%,#72588d_48%,#e4a775_100%)]">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_35%_30%,rgba(255,255,255,.3),transparent_28%)]" />
            <div className="absolute bottom-2 left-2 grid size-8 place-items-center rounded-full bg-white/85 shadow-sm">
              <div className="ml-0.5 size-0 border-y-[5px] border-l-[8px] border-y-transparent border-l-black/65" />
            </div>
            <div className="absolute bottom-3 left-12 h-1.5 w-16 rounded-full bg-white/70" />
          </div>
        ) : isImage ? (
          <div className="h-full rounded-[0.9rem] bg-[linear-gradient(145deg,#9fc7d8_0%,#d9e6c5_42%,#dfa877_100%)]">
            <div className="h-full rounded-[0.9rem] bg-[radial-gradient(circle_at_72%_28%,rgba(255,255,255,.72),transparent_34%)]" />
          </div>
        ) : (
          <>
            <div
              className={`h-2.5 rounded-full ${
                isArticle ? "w-20 bg-sky-400/35" : "w-24 bg-black/14"
              }`}
            />
            <div className="mt-3 h-2 w-28 rounded-full bg-black/8" />
            <div className="mt-2 h-2 w-24 rounded-full bg-black/8" />
            <div className="mt-2 h-2 w-16 rounded-full bg-black/8" />
          </>
        )}
      </div>
    );
  }

  return (
    <div className="group relative h-52 w-[18.5rem] cursor-pointer select-none">
      <svg
        aria-hidden="true"
        className="absolute inset-x-2 bottom-1 top-0 z-0 h-[12.75rem] w-[17.5rem] overflow-visible drop-shadow-[0_12px_15px_rgba(0,0,0,0.08)]"
        viewBox="0 0 280 204"
        preserveAspectRatio="none"
      >
        <path
          d="M 34 1 H 112 C 128 1 139 8 149 19 L 158 28 H 239 C 262 28 278 45 278 68 V 184 C 278 195 269 203 258 203 H 22 C 11 203 2 195 2 184 V 35 C 2 16 16 1 34 1 Z"
          fill={colors.backHex}
          stroke={colors.borderHex}
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      {previewTypes.length > 0 ? (
        <div className="absolute inset-x-5 top-2 z-[2] h-36 overflow-visible">
          {previewTypes[5] ? (
            <PreviewCard
              type={previewTypes[5]}
              className="bottom-0 left-[5.2rem] h-[5.2rem] w-36 -translate-y-9 rotate-[5deg] group-hover:translate-x-1 group-hover:-translate-y-14 group-hover:rotate-[7deg]"
            />
          ) : null}
          {previewTypes[4] ? (
            <PreviewCard
              type={previewTypes[4]}
              className="bottom-0 left-[2.8rem] h-[5.2rem] w-36 -translate-y-8 -rotate-[5deg] group-hover:-translate-x-1 group-hover:-translate-y-13 group-hover:-rotate-[7deg]"
            />
          ) : null}
          {previewTypes[3] ? (
            <PreviewCard
              type={previewTypes[3]}
              className="bottom-0 left-[4.1rem] h-[5.5rem] w-40 -translate-y-6 rotate-0 group-hover:-translate-y-11"
            />
          ) : null}
          {previewTypes[2] ? (
            <PreviewCard
              type={previewTypes[2]}
              className="bottom-0 left-3 h-24 w-40 -translate-y-3 -rotate-[8deg] group-hover:-translate-x-2 group-hover:-translate-y-8 group-hover:-rotate-[11deg]"
            />
          ) : null}
          {previewTypes[1] ? (
            <PreviewCard
              type={previewTypes[1]}
              className="bottom-0 right-0 h-24 w-40 -translate-y-2 rotate-[7deg] group-hover:translate-x-2 group-hover:-translate-y-7 group-hover:rotate-[10deg]"
            />
          ) : null}
          <PreviewCard
            type={previewTypes[0]!}
            className="bottom-0 left-1/2 h-28 w-44 -translate-x-1/2 -translate-y-1 -rotate-[1deg] group-hover:-translate-y-7"
          />
        </div>
      ) : null}

      <div
        className={`absolute inset-x-0 bottom-0 z-10 flex h-[7.25rem] items-end justify-between overflow-hidden rounded-[2.1rem] border px-7 pb-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_10px_24px_rgba(0,0,0,0.08)] ${colors.front} ${colors.border}`}
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-12 bg-gradient-to-b from-white/16 to-transparent" />
        <div className="min-w-0">
          {isRenaming ? (
            <input
              autoFocus
              className="nodrag nopan w-44 rounded-lg bg-white/45 px-2 py-1 text-xl font-semibold tracking-[-0.02em] text-black/65 outline-none ring-1 ring-black/10 focus:ring-black/25"
              value={name}
              maxLength={60}
              onChange={(event) => setName(event.target.value)}
              onClick={(event) => event.stopPropagation()}
              onBlur={() => {
                const trimmedName = name.trim();
                if (world.id && trimmedName && trimmedName !== world.name) {
                  world.onNameChange?.(world.id, trimmedName);
                }
                setIsRenaming(false);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.currentTarget.blur();
                }
                if (event.key === "Escape") {
                  setIsRenaming(false);
                }
              }}
            />
          ) : (
            <h2 className="truncate text-xl font-semibold tracking-[-0.02em] text-black/55">
              {world.name || "Untitled world"}
            </h2>
          )}
          <p className="mt-0.5 text-xs font-medium text-black/35">
            {itemCount} {itemCount === 1 ? "item" : "items"}
          </p>
        </div>
        <button
          type="button"
          aria-label="Change folder color"
          className="nodrag nopan relative grid size-8 shrink-0 cursor-pointer place-items-center rounded-full text-black/45 transition hover:bg-black/5 hover:text-black/70"
          onClick={(event) => {
            event.stopPropagation();
            setShowColors((current) => !current);
          }}
        >
          <MoreHorizontal className="size-5" />
        </button>
      </div>

      {showColors ? (
        <div
          className="nodrag nopan absolute -bottom-20 right-0 z-20 rounded-2xl border border-border/70 bg-card/95 p-2 shadow-lg backdrop-blur"
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            className="mb-2 w-full cursor-pointer rounded-xl px-2 py-1 text-left text-xs font-medium hover:bg-muted"
            onClick={() => {
              setName(world.name ?? "");
              setIsRenaming(true);
              setShowColors(false);
            }}
          >
            Rename
          </button>
          <div className="flex gap-1.5">
            {worldColors.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-label={option.label}
                className={`size-5 cursor-pointer rounded-full border-2 ${
                  option.className
                } ${
                  color === option.value
                    ? "border-foreground"
                    : "border-transparent"
                }`}
                onClick={() => {
                  if (world.id) {
                    world.onColorChange?.(world.id, option.value);
                  }
                  setShowColors(false);
                }}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function NoteNode({ data }: NodeProps) {
  const note = data as DumpNodeData;
  const dumpType = note.type?.toLowerCase() || "note";
  const body = note.markdown?.trim() || note.preview?.trim() || "";

  return (
    <div
      className="dump-node relative flex h-[26rem] w-80 cursor-pointer flex-col rounded-[1.75rem] border-4 p-5 text-card-foreground transition-transform duration-150 hover:-translate-y-1"
      data-dump-type={dumpType}
    >
      <h2 className="line-clamp-2 font-serif text-2xl font-semibold leading-tight tracking-tight text-foreground">
        {note.title || "Untitled"}
      </h2>

      <div className="dump-node-fade relative mt-4 min-h-0 flex-1 overflow-hidden">
        {body ? (
          <div className="note-prose text-sm leading-relaxed text-muted-foreground">
            <Markdown remarkPlugins={[remarkGfm]}>{body}</Markdown>
          </div>
        ) : (
          <p className="text-sm italic leading-relaxed text-muted-foreground/70">
            No body text yet.
          </p>
        )}
      </div>

      <div className="mt-4 border-t border-border/50 pt-3">
        <span className="truncate text-sm font-semibold text-foreground">
          {note.title || "Untitled"}
        </span>
      </div>
    </div>
  );
}

function ImageNode({ data }: NodeProps) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const image = data as DumpNodeData;

  return (
    <article
      className="dump-node relative w-80 cursor-pointer overflow-hidden rounded-[1.75rem] border-4 border-border bg-card shadow-sm"
      data-dump-type="image"
    >
      {!imageLoaded && !imageFailed ? (
        <div className="aspect-square w-full animate-pulse bg-muted">
          <div className="absolute inset-x-5 bottom-5 h-24 rounded-2xl bg-background/25" />
          <div className="absolute left-7 top-7 size-12 rounded-full bg-background/30" />
        </div>
      ) : null}
      {image.imageUrl && !imageFailed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image.imageUrl}
          alt={image.title || "Saved image"}
          className={`block max-h-[28rem] w-full object-contain transition-opacity duration-300 ${
            imageLoaded ? "opacity-100" : "absolute inset-0 opacity-0"
          }`}
          onLoad={() => setImageLoaded(true)}
          onError={() => setImageFailed(true)}
        />
      ) : (
        <div className="grid aspect-square w-full place-items-center bg-muted">
          <ImageIcon className="size-12 text-muted-foreground/55" />
        </div>
      )}
    </article>
  );
}

function LinkNode({ data }: NodeProps) {
  const link = data as DumpNodeData;
  const host = getUrlHost(link.sourceUrl);
  const [imageFailed, setImageFailed] = useState(false);
  const [faviconFailed, setFaviconFailed] = useState(false);
  const faviconUrl = getFaviconUrl(link.sourceUrl);

  return (
    <article
      className="dump-node group relative w-80 cursor-grab overflow-hidden rounded-[1.65rem] border-[3px] border-border bg-card text-card-foreground shadow-sm transition-shadow active:cursor-grabbing hover:shadow-md"
      data-dump-type="link"
    >
      <div className="relative aspect-[16/9] w-full overflow-hidden bg-slate-200 dark:bg-slate-800">
        {link.linkImageUrl && !imageFailed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={link.linkImageUrl}
            alt=""
            className="size-full object-cover transition duration-300 group-hover:scale-[1.015]"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <div className="grid size-full place-items-center bg-[radial-gradient(circle_at_20%_15%,rgba(255,255,255,0.9),transparent_32%),linear-gradient(135deg,#dbeafe_0%,#e0e7ff_48%,#fce7f3_100%)] dark:bg-[radial-gradient(circle_at_20%_15%,rgba(255,255,255,0.12),transparent_32%),linear-gradient(135deg,#172554_0%,#312e81_48%,#4a044e_100%)]">
            <span className="max-w-[13rem] truncate px-4 text-center font-serif text-xl font-semibold leading-tight text-slate-800/75 dark:text-white/85">
              {host || "Saved link"}
            </span>
          </div>
        )}
        <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-black/5" />
      </div>

      <div className="flex min-h-[4.5rem] items-center gap-2.5 px-3.5 py-3">
        <div className="grid size-7 shrink-0 place-items-center overflow-hidden rounded-lg bg-muted">
          {faviconUrl && !faviconFailed ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={faviconUrl}
              alt=""
              className="size-4.5 object-contain"
              onError={() => setFaviconFailed(true)}
            />
          ) : (
            <Link2 className="size-3.5 text-muted-foreground" />
          )}
        </div>
        <h2 className="min-w-0 flex-1 line-clamp-2 pr-1 text-[13px] font-medium leading-[1.3]">
          {link.title || host || "Saved link"}
        </h2>
        {link.sourceUrl ? (
          <a
            href={link.sourceUrl}
            target="_blank"
            rel="noreferrer"
            aria-label={`Open ${link.title || host || "saved link"}`}
            className="nodrag nopan ml-auto inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1.5 text-[10px] font-semibold text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={(event) => event.stopPropagation()}
          >
            Open
            <ExternalLink className="size-3" />
          </a>
        ) : null}
      </div>
    </article>
  );
}

function PdfNode({ data }: NodeProps) {
  const pdf = data as DumpNodeData;

  return (
    <article
      className="dump-node relative flex h-72 w-80 cursor-pointer flex-col rounded-[1.75rem] border-4 p-5 text-card-foreground"
      data-dump-type="pdf"
    >
      <div className="flex items-start gap-4">
        <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-emerald-500/12 text-emerald-600 dark:text-emerald-300">
          <FileText className="size-6" />
        </div>
      </div>
      <h2 className="mt-5 line-clamp-2 font-serif text-2xl font-semibold leading-tight">
        {pdf.title || "Saved PDF"}
      </h2>
      <p className="mt-4 line-clamp-5 text-sm leading-relaxed text-muted-foreground">
        {pdf.preview || "Extracted PDF text will appear here."}
      </p>
      {pdf.sourceUrl ? (
        <a
          href={pdf.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="nodrag nopan mt-auto inline-flex items-center gap-1.5 self-start rounded-full border border-border bg-background px-3 py-2 text-xs font-semibold transition hover:bg-muted"
          onClick={(event) => event.stopPropagation()}
        >
          Open PDF
          <ExternalLink className="size-3.5" />
        </a>
      ) : null}
    </article>
  );
}

function VideoNode({ data }: NodeProps) {
  const [embedFailed, setEmbedFailed] = useState(false);
  const video = data as DumpNodeData;
  const embedUrl = getVideoEmbedUrl(video.sourceUrl);
  const isDirectVideo = Boolean(
    video.sourceUrl &&
      /\.(?:mp4|webm|mov)(?:$|[?#])/i.test(video.sourceUrl),
  );

  return (
    <article
      className="dump-node relative w-[23rem] cursor-pointer overflow-hidden rounded-[2rem] border-4 bg-black text-card-foreground"
      data-dump-type="video"
    >
      <div className="nodrag nopan nowheel relative aspect-video overflow-hidden bg-black">
        {embedUrl && !embedFailed ? (
          <iframe
            src={embedUrl}
            title={video.title || "Saved video"}
            className="pointer-events-none h-full w-full border-0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            loading="lazy"
            onError={() => setEmbedFailed(true)}
          />
        ) : video.sourceUrl && isDirectVideo && !embedFailed ? (
          <video
            className="h-full w-full object-contain"
            preload="auto"
            muted
            controls
            playsInline
            src={video.sourceUrl}
            onError={() => setEmbedFailed(true)}
          />
        ) : (
          <div className="grid h-full place-items-center bg-[linear-gradient(145deg,#18181b,#3f3f46)] text-white">
            <div className="grid size-16 place-items-center rounded-full bg-white/15">
              <Play className="ml-1 size-7" />
            </div>
          </div>
        )}
      </div>
    </article>
  );
}

function MediaFocusDialog({
  dump,
  onOpenChange,
  onDelete,
}: {
  dump: DumpRecord | null;
  onOpenChange: (open: boolean) => void;
  onDelete: (dump: DumpRecord) => Promise<void>;
}) {
  const [isDeleting, setIsDeleting] = useState(false);
  const content = (dump?.content ?? {}) as Record<string, unknown>;
  const isImage = dump?.type === "photo" || dump?.type === "image";
  const isVideo = dump?.type === "video";
  const sourceUrl =
    typeof content.url === "string" ? content.url : undefined;
  const imageUrl =
    isImage &&
    (typeof content.storagePath === "string" || typeof content.url === "string")
      ? `/api/photos/${dump!.id}`
      : undefined;
  const videoEmbedUrl = isVideo ? getVideoEmbedUrl(sourceUrl) : undefined;

  return (
    <Dialog open={Boolean(dump)} onOpenChange={onOpenChange}>
      <DialogContent
        className="w-auto max-w-[96vw] gap-0 overflow-hidden bg-transparent p-0 shadow-none ring-0"
        showCloseButton
      >
        <DialogTitle className="sr-only">
          {dump?.title || (isImage ? "Focused image" : "Focused video")}
        </DialogTitle>
        <DialogDescription className="sr-only">
          Focused media viewer.
        </DialogDescription>
        <div className="relative flex items-center justify-center overflow-hidden rounded-[min(var(--radius-4xl),24px)] bg-black">
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt={dump?.title || "Focused image"}
              className="block max-h-[92svh] max-w-[96vw] object-contain"
            />
          ) : videoEmbedUrl ? (
            <iframe
              src={videoEmbedUrl}
              title={dump?.title || "Focused video"}
              className="aspect-video max-h-[90svh] w-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
              allowFullScreen
            />
          ) : sourceUrl ? (
            <video
              src={sourceUrl}
              className="max-h-[90svh] max-w-full"
              controls
              autoPlay
              playsInline
            />
          ) : (
            <div className="grid min-h-72 place-items-center text-sm text-white/60">
              Media unavailable
            </div>
          )}
          {dump && isImage ? (
            <button
              type="button"
              aria-label="Delete image"
              disabled={isDeleting}
              className="absolute bottom-3 right-3 grid size-9 place-items-center rounded-full bg-black/65 text-white shadow-lg backdrop-blur transition hover:bg-red-600 disabled:cursor-wait disabled:opacity-60"
              onClick={async () => {
                setIsDeleting(true);
                try {
                  await onDelete(dump);
                } catch (error) {
                  toast.error(
                    error instanceof Error
                      ? error.message
                      : "Failed to delete image.",
                  );
                } finally {
                  setIsDeleting(false);
                }
              }}
            >
              <Trash2 className="size-4" />
            </button>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MusicNode({ data }: NodeProps) {
  const [coverFailed, setCoverFailed] = useState(false);
  const [embedFailed, setEmbedFailed] = useState(false);
  const music = data as DumpNodeData;
  const embedUrl = getMusicEmbedUrl(music.sourceUrl);
  const showCoverImage = Boolean(music.coverUrl && !coverFailed);

  if (embedUrl && !embedFailed) {
    return (
      <article
        className="dump-node relative w-[23rem] cursor-pointer overflow-visible rounded-[2rem] border-4 bg-black text-card-foreground"
        data-dump-type="music"
        data-music-renderer="embed"
      >
        <div className="nodrag nopan nowheel relative h-[152px] overflow-hidden rounded-[calc(2rem-4px)] bg-black">
          <iframe
            src={embedUrl}
            title={`Play ${music.title || "music"}`}
            className="block h-[152px] w-full border-0"
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
            loading="lazy"
            onError={() => setEmbedFailed(true)}
          />
        </div>
      </article>
    );
  }

  return (
    <article
      className="dump-node relative h-72 w-72 cursor-pointer overflow-hidden rounded-[2rem] border-4 bg-black text-card-foreground"
      data-dump-type="music"
      data-music-renderer="fallback"
    >
      {showCoverImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={music.coverUrl}
          alt={`${music.title || "Music"} cover`}
          className="h-full w-full object-cover"
          onError={() => setCoverFailed(true)}
        />
      ) : (
        <div className="grid h-full place-items-center bg-[linear-gradient(145deg,#241c39_0%,#72588d_52%,#e8a36d_100%)]">
          <div className="grid size-20 place-items-center rounded-full border border-white/20 bg-white/15 shadow-inner backdrop-blur">
            <Music2 className="size-9 text-white/90" />
          </div>
        </div>
      )}
    </article>
  );
}

function DumpTypeIcon({ type, className }: { type: string; className?: string }) {
  const key = type.toLowerCase();
  if (key === "photo" || key === "image")
    return <ImageIcon className={className} />;
  if (key === "article" || key === "link") return <Link2 className={className} />;
  if (key === "document" || key === "pdf")
    return <FileText className={className} />;
  if (key === "video") return <Play className={className} />;
  if (key === "music" || key === "audio")
    return <Music2 className={className} />;
  return <FileText className={className} />;
}

function ManageDumpRow({
  dump,
  onDelete,
}: {
  dump: DumpRecord;
  onDelete: (dump: DumpRecord) => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const color = getDumpTypeColor(dump.type);
  const preview = dump.plainText?.trim();
  const created = new Date(dump.createdAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <li className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card/60 px-3 py-2.5 transition hover:border-border hover:bg-card">
      <span
        className="grid size-9 shrink-0 place-items-center rounded-xl text-white"
        style={{ backgroundColor: color }}
      >
        <DumpTypeIcon type={dump.type} className="size-4.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">
          {dump.title || "Untitled"}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          <span className="capitalize">{dump.type}</span>
          {" · "}
          {created}
          {preview ? ` · ${preview}` : ""}
        </p>
      </div>
      {confirming ? (
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            className="rounded-full px-2.5 py-1 text-xs font-medium text-muted-foreground transition hover:bg-muted"
            onClick={() => setConfirming(false)}
            disabled={isDeleting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="flex items-center gap-1 rounded-full bg-red-600 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-red-700 disabled:cursor-wait disabled:opacity-60"
            disabled={isDeleting}
            onClick={async () => {
              setIsDeleting(true);
              try {
                await onDelete(dump);
              } catch (error) {
                toast.error(
                  error instanceof Error
                    ? error.message
                    : "Failed to delete dump.",
                );
                setIsDeleting(false);
                setConfirming(false);
              }
            }}
          >
            {isDeleting ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Trash2 className="size-3.5" />
            )}
            Delete
          </button>
        </div>
      ) : (
        <button
          type="button"
          aria-label={`Delete ${dump.title || "dump"}`}
          className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground transition hover:bg-red-600/10 hover:text-red-600"
          onClick={() => setConfirming(true)}
        >
          <Trash2 className="size-4" />
        </button>
      )}
    </li>
  );
}

function ManageDumpsDialog({
  open,
  onOpenChange,
  dumps,
  isLoading,
  onDelete,
  search,
  onSearchChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dumps: DumpRecord[];
  isLoading: boolean;
  onDelete: (dump: DumpRecord) => Promise<void>;
  search: string;
  onSearchChange: (value: string) => void;
}) {
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const ordered = [...dumps].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    if (!needle) return ordered;
    return ordered.filter(
      (dump) =>
        dump.title.toLowerCase().includes(needle) ||
        dump.plainText?.toLowerCase().includes(needle) ||
        dump.type.toLowerCase().includes(needle),
    );
  }, [dumps, search]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85svh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="flex flex-col items-center space-y-3 border-b border-border/60 px-5 pb-4 pt-5 text-center">
          <div>
            <DialogTitle>Manage dumps</DialogTitle>
            <DialogDescription>
              {dumps.length} {dumps.length === 1 ? "dump" : "dumps"} in this
              world. Deleting is permanent.
            </DialogDescription>
          </div>
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Search dumps…"
              className="pl-9 text-left"
            />
          </div>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading dumps…
            </div>
          ) : filtered.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              {dumps.length === 0
                ? "No dumps in this world yet."
                : "No dumps match your search."}
            </p>
          ) : (
            <ul className="space-y-2">
              {filtered.map((dump) => (
                <ManageDumpRow
                  key={dump.id}
                  dump={dump}
                  onDelete={onDelete}
                />
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function HomeFlow() {
  const { data: session, isPending } = authClient.useSession();
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [dumps, setDumps] = useState<DumpRecord[]>([]);
  const [focusedMedia, setFocusedMedia] = useState<DumpRecord | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [worlds, setWorlds] = useState<WorldRecord[]>([]);
  const [activeWorldId, setActiveWorldId] = useState<string | null>(null);
  const [isLoadingWorlds, setIsLoadingWorlds] = useState(false);
  const [isLoadingDumps, setIsLoadingDumps] = useState(false);
  const [flowInstance, setFlowInstance] =
    useState<ReactFlowInstance<Node, Edge> | null>(null);
  const [focusedSourceId, setFocusedSourceId] = useState<string | null>(null);
  const [isManageOpen, setIsManageOpen] = useState(false);
  const [manageSearch, setManageSearch] = useState("");
  const isSignedIn = Boolean(session);

  const handleDeleteDump = useCallback(
    async (dump: DumpRecord) => {
      const response = await fetch(`/api/dumps/${dump.id}`, {
        method: "DELETE",
      });
      const payload = (await response.json().catch(() => null)) as
        | { id?: string; error?: string }
        | null;
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to delete dump.");
      }

      setFocusedMedia((current) =>
        current?.id === dump.id ? null : current,
      );
      setDumps((current) =>
        current.filter((candidate) => candidate.id !== dump.id),
      );
      setNodes((current) => current.filter((node) => node.id !== dump.id));
      setWorlds((current) =>
        current.map((world) =>
          world.id === dump.worldId
            ? { ...world, itemCount: Math.max(0, world.itemCount - 1) }
            : world,
        ),
      );
      toast.success("Dump deleted.");
    },
    [setNodes],
  );

  useEffect(() => {
    function handleSourceFocus(event: Event) {
      const { sourceId, worldId } = (
        event as CustomEvent<{
          sourceId: string | null;
          worldId?: string | null;
        }>
      ).detail;
      setFocusedSourceId(sourceId);

      if (worldId && worldId !== activeWorldId) {
        setActiveWorldId(worldId);
      }
      if (!sourceId) {
        void flowInstance?.fitView({ duration: 500, padding: 0.2 });
      }
    }

    window.addEventListener(SOURCE_FOCUS_EVENT, handleSourceFocus);
    return () =>
      window.removeEventListener(SOURCE_FOCUS_EVENT, handleSourceFocus);
  }, [activeWorldId, flowInstance]);

  useEffect(() => {
    if (
      focusedSourceId &&
      flowInstance &&
      nodes.some((node) => node.id === focusedSourceId)
    ) {
      void flowInstance.fitView({
        nodes: [{ id: focusedSourceId }],
        duration: 500,
        padding: 0.55,
        maxZoom: 1.15,
      });
    }
  }, [flowInstance, focusedSourceId, nodes]);

  const displayedNodes = useMemo(
    () =>
      nodes.map((node) => ({
        ...node,
        className: focusedSourceId
          ? node.id === focusedSourceId
            ? "source-focus-active"
            : "source-focus-muted"
          : undefined,
      })),
    [focusedSourceId, nodes],
  );

  const nodeTypes = useMemo(
    () => ({
      note: NoteNode,
      image: ImageNode,
      link: LinkNode,
      pdf: PdfNode,
      video: VideoNode,
      music: MusicNode,
      world: WorldNode,
    }),
    [],
  );

  const handleWorldColorChange = useCallback(
    async (worldId: string, color: WorldColor) => {
      const previousColor = worlds.find((world) => world.id === worldId)?.color;

      setWorlds((currentWorlds) =>
        currentWorlds.map((world) =>
          world.id === worldId ? { ...world, color } : world,
        ),
      );

      try {
        const response = await fetch(`/api/worlds/${worldId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ color }),
        });

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as
            | { error?: string }
            | null;
          throw new Error(payload?.error ?? "Failed to update folder color.");
        }
      } catch (error) {
        if (previousColor) {
          setWorlds((currentWorlds) =>
            currentWorlds.map((world) =>
              world.id === worldId
                ? { ...world, color: previousColor }
                : world,
            ),
          );
        }
        toast.error(
          error instanceof Error
            ? error.message
            : "Failed to update folder color.",
        );
      }
    },
    [worlds],
  );

  const handleWorldNameChange = useCallback(
    async (worldId: string, name: string) => {
      const previousName = worlds.find((world) => world.id === worldId)?.name;

      setWorlds((currentWorlds) =>
        currentWorlds.map((world) =>
          world.id === worldId ? { ...world, name } : world,
        ),
      );

      try {
        const response = await fetch(`/api/worlds/${worldId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        });

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as
            | { error?: string }
            | null;
          throw new Error(payload?.error ?? "Failed to rename folder.");
        }
      } catch (error) {
        if (previousName) {
          setWorlds((currentWorlds) =>
            currentWorlds.map((world) =>
              world.id === worldId ? { ...world, name: previousName } : world,
            ),
          );
        }
        toast.error(
          error instanceof Error ? error.message : "Failed to rename folder.",
        );
      }
    },
    [worlds],
  );

  useEffect(() => {
    if (!isSignedIn) {
      setWorlds([]);
      setActiveWorldId(null);
      setDumps([]);
      setNodes([]);
      return;
    }

    let ignore = false;

    async function loadWorlds() {
      setIsLoadingWorlds(true);

      try {
        const response = await fetch("/api/worlds");
        const payload = (await response.json()) as
          | { worlds: WorldRecord[] }
          | { error?: string };

        if (!response.ok || !("worlds" in payload)) {
          throw new Error(
            "error" in payload && payload.error
              ? payload.error
              : "Failed to load worlds.",
          );
        }

        if (!ignore) {
          const savedWorldId = window.localStorage.getItem(
            "dumpd:active-world",
          );
          const selectedWorld =
            payload.worlds.find((world) => world.id === savedWorldId) ??
            null;

          setWorlds(payload.worlds);
          setActiveWorldId(selectedWorld?.id ?? null);
        }
      } catch (error) {
        if (!ignore) {
          toast.error(
            error instanceof Error ? error.message : "Failed to load worlds.",
          );
        }
      } finally {
        if (!ignore) {
          setIsLoadingWorlds(false);
        }
      }
    }

    loadWorlds();

    return () => {
      ignore = true;
    };
  }, [isSignedIn]);

  useEffect(() => {
    if (isSignedIn && activeWorldId === null) {
      setNodes(
        worlds.map((world, index) =>
          worldToNode(
            world,
            index,
            handleWorldColorChange,
            handleWorldNameChange,
          ),
        ),
      );
      setEdges([]);
    }
  }, [
    activeWorldId,
    handleWorldColorChange,
    handleWorldNameChange,
    isSignedIn,
    setEdges,
    setNodes,
    worlds,
  ]);

  useEffect(() => {
    if (!isSignedIn || !activeWorldId) {
      setDumps([]);
      setIsLoadingDumps(false);
      return;
    }

    let ignore = false;
    setDumps([]);
    setNodes([]);
    setEdges([]);
    setHoveredNodeId(null);
    setIsLoadingDumps(true);
    window.localStorage.setItem("dumpd:active-world", activeWorldId);

    async function loadWorldContent() {
      try {
        const query = `worldId=${encodeURIComponent(activeWorldId!)}`;
        const dumpsResponse = await fetch(`/api/dumps?${query}`);
        const dumpsPayload = (await dumpsResponse.json()) as
          | { dumps: DumpRecord[] }
          | { error?: string };

        if (!dumpsResponse.ok || !("dumps" in dumpsPayload)) {
          throw new Error(
            "error" in dumpsPayload && dumpsPayload.error
              ? dumpsPayload.error
              : "Failed to load dumps.",
          );
        }

        if (!ignore) {
          setDumps(dumpsPayload.dumps);
          setNodes(dumpsPayload.dumps.map(dumpToNode));
        }
      } catch (error) {
        if (!ignore) {
          toast.error(
            error instanceof Error ? error.message : "Failed to load dumps.",
          );
        }
      } finally {
        if (!ignore) {
          setIsLoadingDumps(false);
        }
      }
    }

    loadWorldContent();

    return () => {
      ignore = true;
    };
  }, [activeWorldId, isSignedIn, setEdges, setNodes]);

  const handleWorldSelect = useCallback((worldId: string) => {
    setFocusedMedia(null);
    setActiveWorldId(worldId);
  }, []);

  const handleWorldCreated = useCallback((world: WorldRecord) => {
    setWorlds((currentWorlds) => [...currentWorlds, world]);
    setActiveWorldId(world.id);
  }, []);

  const handleWorldHome = useCallback(() => {
    setFocusedMedia(null);
    setActiveWorldId(null);
    window.localStorage.removeItem("dumpd:active-world");
  }, []);

  const handleWorldDeleted = useCallback(
    (worldId: string) => {
      setWorlds((currentWorlds) =>
        currentWorlds.filter((world) => world.id !== worldId),
      );

      if (activeWorldId === worldId) {
        setActiveWorldId(null);
        window.localStorage.removeItem("dumpd:active-world");
      }
    },
    [activeWorldId],
  );

  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      if (node.type === "world") {
        handleWorldSelect(node.id);
        return;
      }

      const dump = dumps.find((current) => current.id === node.id);

      if (
        dump?.type === "photo" ||
        dump?.type === "image" ||
        dump?.type === "video"
      ) {
        setFocusedMedia(dump);
        return;
      }
    },
    [dumps, handleWorldSelect],
  );

  const handleNodeMouseEnter = useCallback<NodeMouseHandler>(
    (_event, node) => {
      setHoveredNodeId(node.id);
    },
    [],
  );

  const handleNodeMouseLeave = useCallback<NodeMouseHandler>(() => {
    setHoveredNodeId(null);
  }, []);

  const getMiniMapNodeClassName = useCallback(
    (node: Node) =>
      hoveredNodeId && node.id !== hoveredNodeId
        ? "minimap-node-muted"
        : "minimap-node-active",
    [hoveredNodeId],
  );

  const handleNodeDragStop = useCallback(
    async (_event: MouseEvent | TouchEvent, node: Node) => {
      try {
        const isWorld = node.type === "world";
        const response = await fetch(
          isWorld ? `/api/worlds/${node.id}` : `/api/dumps/${node.id}`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ position: node.position }),
          },
        );
        const payload = (await response.json()) as
          | { dump: DumpRecord }
          | { world: Omit<WorldRecord, "itemCount"> }
          | { error?: string };

        if (!response.ok || (!("dump" in payload) && !("world" in payload))) {
          throw new Error(
            "error" in payload && payload.error
              ? payload.error
              : `Failed to save ${isWorld ? "world" : "node"} position.`,
          );
        }

        if ("world" in payload) {
          setWorlds((currentWorlds) =>
            currentWorlds.map((world) =>
              world.id === payload.world.id
                ? { ...world, ...payload.world }
                : world,
            ),
          );
        } else if ("dump" in payload) {
          setDumps((currentDumps) =>
            currentDumps.map((dump) =>
              dump.id === payload.dump.id ? payload.dump : dump,
            ),
          );
        }
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Failed to save node position.",
        );
      }
    },
    [],
  );

  const minimapStyle = useMemo(
    () => ({
      background: "var(--card)",
      border: "1px solid var(--border)",
      borderRadius: "18px",
      overflow: "hidden",
    }),
    [],
  );

  return (
    <div className="relative h-svh w-full">
      <ReactFlow
        key={activeWorldId}
        nodes={displayedNodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onInit={setFlowInstance}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        onNodeMouseEnter={handleNodeMouseEnter}
        onNodeMouseLeave={handleNodeMouseLeave}
        onNodeDragStop={handleNodeDragStop}
        deleteKeyCode={null}
        nodesConnectable={false}
        fitView
        minZoom={0.6}
        maxZoom={1.4}
        defaultEdgeOptions={{
          type: "smoothstep",
          style: {
            stroke: "var(--muted-foreground)",
            strokeWidth: 1.5,
          },
        }}
        className="bg-background"
        proOptions={{ hideAttribution: true }}
      >
        <MiniMap
          pannable
          zoomable
          className="hidden !overflow-hidden !rounded-[18px] !bg-card md:block"
          nodeColor={(node) =>
            (node.data as { minimapColor?: string })?.minimapColor ??
            getDumpTypeColor((node.data as { type?: string })?.type)
          }
          nodeStrokeColor={(node) =>
            (node.data as { minimapColor?: string })?.minimapColor ??
            getDumpTypeColor((node.data as { type?: string })?.type)
          }
          nodeStrokeWidth={3}
          nodeBorderRadius={6}
          nodeClassName={getMiniMapNodeClassName}
          maskColor="color-mix(in oklab, var(--background) 72%, transparent)"
          style={minimapStyle}
        />
        {/* <Background
          variant={BackgroundVariant.Dots}
          gap={22}
          size={2}
          color="var(--border)"
        /> */}
      </ReactFlow>
      {isSignedIn && !isLoadingWorlds ? (
        <div className="absolute left-3 top-[calc(env(safe-area-inset-top)+0.75rem)] z-20 md:left-4 md:top-4">
          <WorldSwitcher
            worlds={worlds}
            activeWorldId={activeWorldId}
            onHome={handleWorldHome}
            onSelect={handleWorldSelect}
            onCreated={handleWorldCreated}
            onDeleted={handleWorldDeleted}
          />
        </div>
      ) : null}
      {isSignedIn && activeWorldId && !isLoadingWorlds ? (
        <div className="pointer-events-none absolute inset-x-0 top-[calc(env(safe-area-inset-top)+0.75rem)] z-10 flex justify-center px-20 md:top-4">
          <button
            type="button"
            onClick={() => setIsManageOpen(true)}
            className="pointer-events-auto flex w-full max-w-xs items-center gap-2 rounded-full border border-border/70 bg-card/80 px-3.5 py-2 text-sm text-muted-foreground shadow-sm backdrop-blur-xl transition hover:bg-card hover:text-foreground"
          >
            <Search className="size-4 shrink-0" />
            <span className="flex-1 text-left">Search & manage dumps…</span>
            <Layers className="size-4 shrink-0 opacity-70" />
          </button>
        </div>
      ) : null}
      {activeWorldId &&
      nodes.length === 0 &&
      !isPending &&
      !isLoadingWorlds &&
      !isLoadingDumps ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-5 pb-32 pt-24 md:px-8 md:pb-24 md:pt-20">
          <div className="pointer-events-auto flex w-full max-w-sm flex-col items-center gap-4 rounded-[2rem] border border-border/70 bg-card/80 px-6 py-6 text-center shadow-sm backdrop-blur-xl">
            <p className="text-balance text-sm font-medium text-muted-foreground md:text-base">
              {isSignedIn
                ? "No dumps yet. Add one through the dumpd MCP."
                : "Sign in with google to play around"}
            </p>
          </div>
        </div>
      ) : null}
      <MediaFocusDialog
        dump={focusedMedia}
        onDelete={handleDeleteDump}
        onOpenChange={(open) => {
          if (!open) setFocusedMedia(null);
        }}
      />
      <ManageDumpsDialog
        open={isManageOpen}
        onOpenChange={(open) => {
          setIsManageOpen(open);
          if (!open) setManageSearch("");
        }}
        dumps={dumps}
        isLoading={isLoadingDumps}
        onDelete={handleDeleteDump}
        search={manageSearch}
        onSearchChange={setManageSearch}
      />
    </div>
  );
}

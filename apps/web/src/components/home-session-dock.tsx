"use client";

import { useEffect, useMemo, useState } from "react";
import { useChat } from "@ai-sdk/react";
import {
  ArrowPathIcon,
  ArrowRightStartOnRectangleIcon,
  PaperAirplaneIcon,
} from "@heroicons/react/24/outline";
import { DefaultChatTransport } from "ai";
import { useTheme } from "next-themes";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";

import { Button } from "@dumpd/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@dumpd/ui/components/dropdown-menu";
import { Input } from "@dumpd/ui/components/input";
import { cn } from "@dumpd/ui/lib/utils";

import { authClient } from "@/lib/auth-client";
import {
  SOURCE_FOCUS_EVENT,
  type ChatMessage,
  type ChatSource,
} from "@/lib/chat-sources";

import { Login } from "./login";
import { ThemeSwitcher } from "./theme-switcher";

type SessionUser = {
  email?: string | null;
  image?: string | null;
  name?: string | null;
};

type ThemeMode = "system" | "light" | "dark";

function getInitials(name?: string | null, email?: string | null) {
  const source = name?.trim() || email?.trim() || "U";
  const parts = source.split(/\s+/).filter(Boolean);

  return parts
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function UserAvatar({
  user,
  className,
}: {
  user?: SessionUser;
  className?: string;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const imageSrc = user?.image?.trim();

  useEffect(() => {
    setImageFailed(false);
  }, [imageSrc]);

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden",
        className,
      )}
      aria-hidden={!user}
    >
      {imageSrc && !imageFailed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageSrc}
          alt={user?.name || user?.email || "User avatar"}
          className="block size-full object-cover"
          referrerPolicy="no-referrer"
          onError={() => setImageFailed(true)}
        />
      ) : (
        getInitials(user?.name, user?.email)
      )}
    </div>
  );
}

export function HomeSessionDock() {
  const { data: session, isPending } = authClient.useSession();
  const { resolvedTheme, setTheme, theme } = useTheme();
  const [input, setInput] = useState("");
  const [focusedSourceId, setFocusedSourceId] = useState<string | null>(null);
  const { error, messages, sendMessage, status } = useChat<ChatMessage>({
    transport: new DefaultChatTransport({
      api: "/api/completion",
      prepareSendMessagesRequest: ({ body, id, messages, trigger, messageId }) => ({
        body: {
          ...body,
          id,
          messages,
          trigger,
          messageId,
          worldId:
            window.localStorage.getItem("dumpd:active-world") || undefined,
        },
      }),
    }),
  });
  const user = (session as { user?: SessionUser } | null)?.user;
  const selectedTheme: ThemeMode =
    theme === "light" || theme === "dark" || theme === "system"
      ? theme
      : "system";
  const isLoading = status === "submitted" || status === "streaming";
  const trimmedInput = input.trim();
  const latestAssistantText = useMemo(() => {
    const message = [...messages]
      .reverse()
      .find((candidate) => candidate.role === "assistant");

    return message?.parts
      .filter(
        (part): part is Extract<(typeof message.parts)[number], { type: "text" }> =>
          part.type === "text",
      )
      .map((part) => part.text)
      .join("\n");
  }, [messages]);
  const latestSources = useMemo(() => {
    const message = [...messages]
      .reverse()
      .find((candidate) => candidate.role === "assistant");
    const part = message?.parts.find(
      (candidate): candidate is Extract<
        (typeof message.parts)[number],
        { type: "data-sources" }
      > => candidate.type === "data-sources",
    );
    return part?.data ?? [];
  }, [messages]);
  const translucentSurfaceStyle = {
    backgroundColor:
      resolvedTheme === "dark"
        ? "rgba(38, 38, 38, 0.42)"
        : "rgba(255, 255, 255, 0.22)",
    borderColor:
      resolvedTheme === "dark"
        ? "rgba(255, 255, 255, 0.14)"
        : "rgba(255, 255, 255, 0.55)",
  } satisfies React.CSSProperties;

  useEffect(() => {
    if (error) toast.error(error.message);
  }, [error]);

  async function handleSignOut() {
    await authClient.signOut();
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!trimmedInput || isLoading) return;

    const text = trimmedInput;
    setInput("");
    setFocusedSourceId(null);
    window.dispatchEvent(
      new CustomEvent(SOURCE_FOCUS_EVENT, { detail: { sourceId: null } }),
    );
    await sendMessage({ text });
  }

  function toggleSource(source: ChatSource) {
    const sourceId =
      focusedSourceId === source.sourceId ? null : source.sourceId;
    setFocusedSourceId(sourceId);
    window.dispatchEvent(
      new CustomEvent(SOURCE_FOCUS_EVENT, {
        detail: { sourceId, worldId: sourceId ? source.worldId : null },
      }),
    );
  }

  return (
    <>
      <div className="fixed right-3 top-[calc(env(safe-area-inset-top)+0.75rem)] z-20 flex items-center gap-2 md:right-4 md:top-4">
        <ThemeSwitcher value={selectedTheme} onChange={setTheme} />
        {session ? (
          <DropdownMenu>
            <DropdownMenuTrigger className="mt-1 flex size-10 cursor-pointer items-center justify-center rounded-full border border-border bg-card p-1 shadow-sm outline-none transition focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 md:size-9">
              <UserAvatar
                user={user}
                className="size-8 rounded-full bg-muted text-center text-[10px] font-medium text-foreground"
              />
              <span className="sr-only">Open user menu</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={10} className="w-72 rounded-3xl p-0">
              <div className="flex items-center gap-3 p-4">
                <UserAvatar
                  user={user}
                  className="size-14 rounded-full bg-muted text-sm font-medium text-foreground"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-semibold text-foreground">
                    {user?.name || "User"}
                  </p>
                  <p className="truncate text-sm text-muted-foreground">
                    {user?.email || ""}
                  </p>
                </div>
              </div>
              <DropdownMenuSeparator className="my-0" />
              <DropdownMenuGroup className="p-1">
                <DropdownMenuItem
                  variant="destructive"
                  className="cursor-pointer rounded-2xl"
                  onClick={handleSignOut}
                >
                  <ArrowRightStartOnRectangleIcon />
                  Log out
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
      <div className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] z-20 flex justify-center px-3 md:bottom-6 md:px-4">
        {isPending ? (
          <div className="pointer-events-auto flex h-10 items-center gap-2 rounded-full border border-border bg-card px-4 shadow-sm">
            <ArrowPathIcon className="size-3.5 animate-spin" />
            <span className="text-xs text-muted-foreground">Loading session</span>
          </div>
        ) : session ? (
          <div className="pointer-events-auto flex w-full max-w-2xl flex-col items-center gap-2">
            {latestAssistantText || isLoading ? (
              <div
                className="max-h-56 w-full max-w-[34rem] overflow-y-auto rounded-[1.75rem] border px-4 py-3 text-sm shadow-sm backdrop-blur-xl"
                style={translucentSurfaceStyle}
              >
                {latestAssistantText ? (
                  <>
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {latestAssistantText}
                    </ReactMarkdown>
                    {latestSources.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-1.5 border-t border-border/50 pt-3">
                        {latestSources.map((source) => {
                          const active = focusedSourceId === source.sourceId;
                          return (
                            <button
                              key={source.sourceId}
                              type="button"
                              aria-pressed={active}
                              className={cn(
                                "max-w-full cursor-pointer truncate rounded-full border px-2.5 py-1 text-[10px] font-semibold transition",
                                active
                                  ? "border-foreground bg-foreground text-background"
                                  : "border-border/70 bg-background/40 text-muted-foreground hover:text-foreground",
                              )}
                              onClick={() => toggleSource(source)}
                            >
                              {source.title}
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <ArrowPathIcon className="size-3 animate-spin" />
                    Thinking...
                  </div>
                )}
              </div>
            ) : null}
            <form
              onSubmit={handleSubmit}
              className="flex w-full max-w-[34rem] items-center gap-1 rounded-[1.75rem] border px-2 py-2 shadow-sm backdrop-blur-xl"
              style={translucentSurfaceStyle}
            >
              <Input
                aria-label="AI chat input"
                placeholder="Ask AI about your flow..."
                autoComplete="off"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                disabled={isLoading}
                className="h-10 rounded-full border-0 bg-transparent px-3 text-sm shadow-none focus-visible:ring-0"
              />
              <Button
                type="submit"
                size="icon-sm"
                className="size-10 cursor-pointer rounded-full"
                disabled={!trimmedInput || isLoading}
              >
                <PaperAirplaneIcon />
                <span className="sr-only">Send message</span>
              </Button>
            </form>
          </div>
        ) : (
          <div className="pointer-events-auto">
            <Login />
          </div>
        )}
      </div>
    </>
  );
}

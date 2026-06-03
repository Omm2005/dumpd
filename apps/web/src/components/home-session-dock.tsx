"use client";

import { useEffect, useMemo, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import {
  ArrowPathIcon,
  ArrowRightStartOnRectangleIcon,
  PaperAirplaneIcon,
} from "@heroicons/react/24/outline";
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

import { authClient } from "@/lib/auth-client";

import { Login } from "./login";
import { ThemeSwitcher } from "./theme-switcher";

type SessionUser = {
  email?: string | null;
  image?: string | null;
  name?: string | null;
};

function getInitials(name?: string | null, email?: string | null) {
  const source = name?.trim() || email?.trim() || "U";
  const parts = source.split(/\s+/).filter(Boolean);

  if (parts.length === 1) {
    return parts[0]?.slice(0, 2).toUpperCase() ?? "U";
  }

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
  const initials = getInitials(user?.name, user?.email);

  return (
    <div
      className={`${className ?? ""} flex shrink-0 items-center justify-center overflow-hidden`}
      aria-hidden={!user?.image}
    >
      {user?.image ? (
        <img
          src={user.image}
          alt={user.name || user.email || "User avatar"}
          className="block size-full object-cover"
        />
      ) : (
        initials
      )}
    </div>
  );
}

function MarkdownMessage({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
          ul: ({ children }) => <ul className="mb-2 list-disc pl-4 last:mb-0">{children}</ul>,
          ol: ({ children }) => <ol className="mb-2 list-decimal pl-4 last:mb-0">{children}</ol>,
          li: ({ children }) => <li className="mb-1 last:mb-0">{children}</li>,
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2"
            >
              {children}
            </a>
          ),
          code: ({ children, className }) =>
            className ? (
              <code className="block overflow-x-auto rounded-md bg-black/10 px-2 py-1 font-mono text-[11px] dark:bg-white/10">
                {children}
              </code>
            ) : (
              <code className="rounded bg-black/10 px-1 py-0.5 font-mono text-[11px] dark:bg-white/10">
                {children}
              </code>
            ),
          pre: ({ children }) => <>{children}</>,
          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

function getLatestSection(content: string) {
  const blocks = content
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  if (blocks.length <= 2) {
    return content;
  }

  const lastBlock = blocks.at(-1) ?? "";
  const previousBlock = blocks.at(-2) ?? "";
  const looksLikeHeading =
    previousBlock.length > 0 &&
    previousBlock.length <= 120 &&
    !previousBlock.includes("\n") &&
    !/[.!?]$/.test(previousBlock);

  return looksLikeHeading ? `${previousBlock}\n\n${lastBlock}` : lastBlock;
}

function extractAnswerAndFollowUps(content: string) {
  const marker = "<<<FOLLOWUPS>>>";
  const markerIndex = content.indexOf(marker);

  if (markerIndex === -1) {
    return {
      answer: content.trim(),
      followUps: [] as string[],
    };
  }

  const answer = content.slice(0, markerIndex).trim();
  const rawFollowUps = content.slice(markerIndex + marker.length).trim();
  const followUps = rawFollowUps
    .split("\n")
    .map((line) => line.replace(/^\s*[-*]\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 3);

  return { answer, followUps };
}

export function HomeSessionDock() {
  const { data: session, isPending } = authClient.useSession();
  const { resolvedTheme, setTheme, theme } = useTheme();
  const [input, setInput] = useState("");
  const {
    error,
    messages,
    sendMessage,
    status,
  } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/completion",
    }),
  });
  const trimmedMessage = input.trim();
  const user = (session as { user?: SessionUser } | null)?.user;
  const userName = user?.name || "User";
  const userEmail = user?.email || "";
  const activeTheme = theme === "system" ? "system" : resolvedTheme === "dark" ? "dark" : "light";
  const isLoading = status === "submitted" || status === "streaming";
  const translucentSurfaceStyle = {
    backgroundColor:
      activeTheme === "dark" ? "rgba(38, 38, 38, 0.42)" : "rgba(255, 255, 255, 0.22)",
    borderColor: activeTheme === "dark" ? "rgba(255, 255, 255, 0.14)" : "rgba(255, 255, 255, 0.55)",
  } satisfies React.CSSProperties;
  const latestUserMessageIndex = useMemo(
    () => [...messages].map((message) => message.role).lastIndexOf("user"),
    [messages],
  );
  const latestAssistantMessage = useMemo(() => {
    if (latestUserMessageIndex === -1) {
      return undefined;
    }

    return [...messages.slice(latestUserMessageIndex + 1)]
      .reverse()
      .find((message) => message.role === "assistant");
  }, [latestUserMessageIndex, messages]);
  const latestDisplayPart = useMemo(
    () =>
      [...(latestAssistantMessage?.parts ?? [])]
        .reverse()
        .find((part) => part.type === "reasoning" || part.type === "text"),
    [latestAssistantMessage],
  );
  const reasoning =
    latestDisplayPart?.type === "reasoning" ? getLatestSection(latestDisplayPart.text) : "";
  const parsedAnswer = useMemo(
    () => extractAnswerAndFollowUps(latestDisplayPart?.type === "text" ? latestDisplayPart.text : ""),
    [latestDisplayPart],
  );
  const answer = parsedAnswer.answer;
  const followUpQuestions = parsedAnswer.followUps;

  useEffect(() => {
    if (error) {
      toast.error(error.message);
    }
  }, [error]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!trimmedMessage) {
      return;
    }

    const prompt = trimmedMessage;
    setInput("");
    await sendMessage({ text: prompt });
  }

  async function handleSignOut() {
    await authClient.signOut();
  }

  async function handleFollowUp(question: string) {
    if (isLoading) {
      return;
    }

    setInput("");
    await sendMessage({ text: question });
  }

  return (
    <>
      <div className="fixed right-4 top-4 z-20 flex items-center gap-2">
        <div>
          <ThemeSwitcher value={activeTheme} onChange={setTheme} />
        </div>
        {session ? (
          <DropdownMenu>
            <DropdownMenuTrigger className="mt-1 flex size-9 cursor-pointer items-center justify-center rounded-full border border-border bg-card p-1 shadow-sm outline-none transition focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30">
              <UserAvatar
                user={user}
                className="size-8 rounded-full bg-muted object-cover text-center text-[10px] font-medium leading-7 text-foreground"
              />
              <span className="sr-only">Open user menu</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="top" sideOffset={10} className="w-72 rounded-3xl p-0">
              <div className="flex items-center gap-3 p-4">
                <UserAvatar
                  user={user}
                  className="size-14 rounded-full bg-muted object-cover text-center text-sm font-medium leading-14 text-foreground"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-semibold text-foreground">{userName}</p>
                  <p className="truncate text-sm text-muted-foreground">{userEmail}</p>
                </div>
              </div>
              <DropdownMenuSeparator className="my-0" />
              <DropdownMenuGroup className="p-1">
                <DropdownMenuItem
                  variant="destructive"
                  className="cursor-pointer rounded-2xl hover:bg-destructive/10 hover:text-destructive focus:bg-destructive/10 focus:text-destructive"
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
      <div className="pointer-events-none fixed inset-x-0 bottom-6 z-20 flex justify-center px-4">
        {isPending ? (
          <div className="pointer-events-auto flex h-9 w-full max-w-64 items-center justify-center gap-2 rounded-full border border-border bg-card px-3 shadow-sm">
            <ArrowPathIcon className="size-3.5 animate-spin text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Loading session</span>
          </div>
        ) : session ? (
          <div className="pointer-events-auto flex w-full flex-col items-center gap-2">
            {isLoading || latestDisplayPart ? (
              <div
                className="w-full max-w-[27rem] rounded-2xl border px-3 py-2 shadow-sm backdrop-blur-xl"
                style={translucentSurfaceStyle}
              >
                {reasoning || (isLoading && !answer) ? (
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      {isLoading ? <ArrowPathIcon className="size-3 animate-spin text-muted-foreground" /> : null}
                      <p className="text-[11px] font-medium text-muted-foreground">Reasoning</p>
                    </div>
                    <MarkdownMessage
                      content={reasoning || "Thinking through it..."}
                      className="break-words text-[11px] text-muted-foreground"
                    />
                  </div>
                ) : null}
                {answer ? (
                  <div className="flex flex-col gap-2">
                    <MarkdownMessage
                      content={answer}
                      className="break-words text-xs text-foreground"
                    />
                    <p className="text-[11px] text-muted-foreground">gemini-2.5-flash</p>
                    {followUpQuestions.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {followUpQuestions.map((question) => (
                          <button
                            key={question}
                            type="button"
                            onClick={() => void handleFollowUp(question)}
                            disabled={isLoading}
                            className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-muted-foreground transition hover:bg-white/10 hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
                          >
                            {question}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
            <form
              onSubmit={handleSubmit}
              className="flex w-full max-w-72 items-center gap-1 rounded-full border px-1.5 py-1 shadow-sm backdrop-blur-xl"
              style={translucentSurfaceStyle}
            >
              <Input
                aria-label="AI chat input"
                placeholder="Ask AI about your flow..."
                autoComplete="off"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                disabled={isLoading}
                className="h-7 rounded-full border-0 bg-transparent px-2 text-xs shadow-none focus-visible:ring-0"
              />
              <Button
                type="submit"
                size="icon-xs"
                className="size-7 cursor-pointer rounded-full"
                disabled={!trimmedMessage || isLoading}
              >
                <PaperAirplaneIcon data-icon="inline-start" />
                <span className="sr-only">Send message</span>
              </Button>
            </form>
          </div>
        ) : (
          <div className="pointer-events-auto flex justify-center">
            <Login />
          </div>
        )}
      </div>
    </>
  );
}

"use client";

import { useChat } from "@ai-sdk/react";
import {
  ArrowUp,
  Check,
  Copy,
  History,
  Layers3,
  Loader2,
  PanelLeftClose,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import { DefaultChatTransport } from "ai";

import { Button } from "@dumpd/ui/components/button";
import { cn } from "@dumpd/ui/lib/utils";

import {
  MANAGE_DUMPS_EVENT,
  SOURCE_FOCUS_EVENT,
  type ChatMessage,
  type ChatSource,
} from "@/lib/chat-sources";

const CHAT_STORAGE_KEY = "dumpd:ai-conversations:v1";
const MAX_SAVED_CONVERSATIONS = 30;

type SavedConversation = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
};

type StoredChatState = {
  activeId: string;
  conversations: SavedConversation[];
};

function createConversation(): SavedConversation {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    title: "New conversation",
    createdAt: now,
    updatedAt: now,
    messages: [],
  };
}

function messageText(message: ChatMessage) {
  return message.parts
    .filter(
      (part): part is Extract<
        (typeof message.parts)[number],
        { type: "text" }
      > => part.type === "text",
    )
    .map((part) => part.text)
    .join("\n")
    .trim();
}

function messageSources(message: ChatMessage) {
  return message.parts.flatMap((part) =>
    part.type === "data-sources" ? part.data : [],
  );
}

function assistantDisplayText(message: ChatMessage) {
  const text = messageText(message);
  if (messageSources(message).length === 0) return text;
  return text.replace(/\n(?:#{1,4}\s*)?sources:\s*[\s\S]*$/i, "").trim();
}

function conversationTitle(messages: ChatMessage[]) {
  const firstQuestion = messages.find((message) => message.role === "user");
  const text = firstQuestion ? messageText(firstQuestion) : "";
  if (!text) return "New conversation";
  return text.length > 58 ? `${text.slice(0, 58).trim()}…` : text;
}

function formatConversationTime(value: string) {
  const date = new Date(value);
  const now = new Date();
  return date.toDateString() === now.toDateString()
    ? date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function readStoredChatState(): StoredChatState {
  const fresh = createConversation();
  if (typeof window === "undefined") {
    return { activeId: fresh.id, conversations: [fresh] };
  }

  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(CHAT_STORAGE_KEY) ?? "",
    ) as Partial<StoredChatState>;
    const conversations = Array.isArray(parsed.conversations)
      ? parsed.conversations.filter(
          (conversation): conversation is SavedConversation =>
            Boolean(
              conversation &&
                typeof conversation.id === "string" &&
                typeof conversation.title === "string" &&
                Array.isArray(conversation.messages),
            ),
        )
      : [];

    if (conversations.length === 0) {
      return { activeId: fresh.id, conversations: [fresh] };
    }

    return {
      activeId:
        typeof parsed.activeId === "string" &&
        conversations.some(
          (conversation) => conversation.id === parsed.activeId,
        )
          ? parsed.activeId
          : conversations[0]!.id,
      conversations,
    };
  } catch {
    return { activeId: fresh.id, conversations: [fresh] };
  }
}

function ThinkingState() {
  return (
    <div className="flex items-center gap-2.5 px-1 py-2 text-xs text-muted-foreground">
      <span className="relative grid size-7 place-items-center rounded-full border border-white/60 bg-background/45 backdrop-blur-xl">
        <Sparkles className="size-3.5 animate-pulse text-foreground" />
      </span>
      <span>Thinking through your world</span>
      <span className="flex gap-1" aria-hidden="true">
        <span className="size-1 animate-bounce rounded-full bg-foreground/45 [animation-delay:-0.2s]" />
        <span className="size-1 animate-bounce rounded-full bg-foreground/45 [animation-delay:-0.1s]" />
        <span className="size-1 animate-bounce rounded-full bg-foreground/45" />
      </span>
    </div>
  );
}

function SourceResults({
  message,
  onSourceClick,
}: {
  message: ChatMessage;
  onSourceClick: (source: ChatSource) => void;
}) {
  const sources = messageSources(message);
  if (sources.length === 0) return null;

  const images = sources.filter(
    (source) => source.modality === "image" && source.previewUrl,
  );
  const otherSources = sources.filter(
    (source) => source.modality !== "image" || !source.previewUrl,
  );

  return (
    <div className="mt-4 border-t border-foreground/10 pt-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-semibold text-foreground">
          {images.length > 0 ? "Saved images" : "Sources"}
        </span>
        <span className="text-[10px] text-muted-foreground">
          {sources.length} result{sources.length === 1 ? "" : "s"}
        </span>
      </div>

      {images.length > 0 ? (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {images.map((source) => (
            <button
              key={source.sourceId}
              type="button"
              className="group/image overflow-hidden rounded-xl border border-white/45 bg-background/25 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-foreground/15"
              onClick={() => onSourceClick(source)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={source.previewUrl!}
                alt={source.title}
                className="aspect-square w-full object-cover"
              />
              <span className="block truncate px-2 py-1.5 text-[10px] font-medium text-foreground">
                {source.title}
              </span>
            </button>
          ))}
        </div>
      ) : null}

      {otherSources.length > 0 ? (
        <div className={cn("flex flex-col gap-1", images.length > 0 && "mt-3")}>
          {otherSources.map((source, index) => (
            <button
              key={`${source.sourceId}-${index}`}
              type="button"
              className="flex cursor-pointer items-center gap-2.5 rounded-xl px-2 py-2 text-left transition hover:bg-background/35"
              onClick={() => onSourceClick(source)}
            >
              <span className="grid size-6 shrink-0 place-items-center rounded-lg bg-background/50 text-[9px] font-bold text-muted-foreground ring-1 ring-foreground/7">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
                {source.title}
              </span>
              <span className="text-[9px] capitalize text-muted-foreground">
                {source.modality}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function AssistantMessage({
  message,
  onSourceClick,
}: {
  message: ChatMessage;
  onSourceClick: (source: ChatSource) => void;
}) {
  const [copied, setCopied] = useState(false);
  const text = assistantDisplayText(message);

  async function copyResponse() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <article className="group/answer">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="grid size-6 place-items-center rounded-full border border-white/60 bg-background/40 backdrop-blur-xl">
            <Sparkles className="size-3 text-foreground" />
          </span>
          <span className="text-[11px] font-semibold text-foreground">
            dumpd AI
          </span>
        </div>
        {text ? (
          <button
            type="button"
            aria-label="Copy response"
            className="grid size-7 cursor-pointer place-items-center rounded-full text-muted-foreground opacity-0 transition hover:bg-background/40 hover:text-foreground focus-visible:opacity-100 group-hover/answer:opacity-100"
            onClick={copyResponse}
          >
            {copied ? (
              <Check className="size-3.5" />
            ) : (
              <Copy className="size-3.5" />
            )}
          </button>
        ) : null}
      </div>
      {text ? (
        <div className="assistant-prose assistant-prose-compact">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
        </div>
      ) : (
        <ThinkingState />
      )}
      <SourceResults message={message} onSourceClick={onSourceClick} />
    </article>
  );
}

function ConversationSearch({
  conversation,
  open,
  onOpenChange,
  onMessagesChange,
  onHistoryOpen,
  onNewConversation,
}: {
  conversation: SavedConversation;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onMessagesChange: (messages: ChatMessage[]) => void;
  onHistoryOpen: () => void;
  onNewConversation: () => void;
}) {
  const [input, setInput] = useState("");
  const [focusedSourceId, setFocusedSourceId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { error, messages, sendMessage, status } = useChat<ChatMessage>({
    id: conversation.id,
    messages: conversation.messages,
    experimental_throttle: 40,
    transport: new DefaultChatTransport({
      api: "/api/completion",
      prepareSendMessagesRequest: ({
        body,
        id,
        messages: nextMessages,
        trigger,
        messageId,
      }) => ({
        body: {
          ...body,
          id,
          messages: nextMessages,
          trigger,
          messageId,
          worldId:
            window.localStorage.getItem("dumpd:active-world") || undefined,
        },
      }),
    }),
  });
  const isLoading = status === "submitted" || status === "streaming";
  const trimmedInput = input.trim();
  const lastMessage = messages.at(-1);
  const showThinking =
    status === "submitted" ||
    (status === "streaming" &&
      lastMessage?.role === "assistant" &&
      !messageText(lastMessage));

  useEffect(() => {
    onMessagesChange(messages);
  }, [messages, onMessagesChange]);

  useEffect(() => {
    if (error) toast.error(error.message);
  }, [error]);

  useEffect(() => {
    if (!open) return;
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, open, status]);

  const toggleSource = useCallback(
    (source: ChatSource) => {
      const sourceId =
        focusedSourceId === source.sourceId ? null : source.sourceId;
      setFocusedSourceId(sourceId);
      window.dispatchEvent(
        new CustomEvent(SOURCE_FOCUS_EVENT, {
          detail: { sourceId, worldId: sourceId ? source.worldId : null },
        }),
      );
    },
    [focusedSourceId],
  );

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!trimmedInput || isLoading) return;

    const text = trimmedInput;
    setInput("");
    onOpenChange(true);
    setFocusedSourceId(null);
    window.dispatchEvent(
      new CustomEvent(SOURCE_FOCUS_EVENT, { detail: { sourceId: null } }),
    );
    await sendMessage({ text });
  }

  return (
    <section
      aria-label="AI search and conversation"
      className={cn(
        "ai-top-search fixed left-1/2 top-[calc(env(safe-area-inset-top)+0.75rem)] z-30 w-[min(42rem,calc(100vw-27rem))] min-w-[28rem] -translate-x-1/2 overflow-hidden border border-white/60 bg-background/42 shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_10px_34px_rgba(65,54,40,0.10)] backdrop-blur-2xl transition-[border-radius,box-shadow] duration-300 max-lg:w-[min(38rem,calc(100vw-2rem))] max-lg:min-w-0 md:top-4",
        open ? "rounded-[1.6rem]" : "rounded-full",
      )}
    >
      <form
        onSubmit={handleSubmit}
        className="relative flex h-12 items-center gap-2 px-2"
      >
        <button
          type="button"
          aria-label="Open conversation history"
          className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-full text-muted-foreground transition hover:bg-background/50 hover:text-foreground"
          onClick={onHistoryOpen}
        >
          <History className="size-4" />
        </button>
        <Search className="size-4 shrink-0 text-muted-foreground" />
        <input
          aria-label="Ask AI or search your world"
          placeholder="Ask anything or search your world…"
          autoComplete="off"
          value={input}
          onFocus={() => {
            if (messages.length > 0) onOpenChange(true);
          }}
          onChange={(event) => setInput(event.target.value)}
          className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
        />
        <button
          type="button"
          aria-label="Manage saved content"
          className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-full text-muted-foreground transition hover:bg-background/50 hover:text-foreground"
          onClick={() => window.dispatchEvent(new Event(MANAGE_DUMPS_EVENT))}
        >
          <Layers3 className="size-4" />
        </button>
        {open ? (
          <button
            type="button"
            aria-label="Close conversation"
            className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-full text-muted-foreground transition hover:bg-background/50 hover:text-foreground"
            onClick={() => onOpenChange(false)}
          >
            <X className="size-4" />
          </button>
        ) : null}
        <Button
          type="submit"
          size="icon-sm"
          className="size-8 cursor-pointer rounded-full"
          disabled={!trimmedInput || isLoading}
        >
          {isLoading ? <Loader2 className="animate-spin" /> : <ArrowUp />}
          <span className="sr-only">Send message</span>
        </Button>
      </form>

      {open ? (
        <div className="border-t border-foreground/8">
          <div className="flex items-center justify-between px-4 py-2">
            <span className="max-w-[75%] truncate text-[11px] font-medium text-muted-foreground">
              {conversation.title}
            </span>
            <button
              type="button"
              className="flex cursor-pointer items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium text-muted-foreground transition hover:bg-background/45 hover:text-foreground"
              onClick={onNewConversation}
            >
              <Plus className="size-3" />
              New
            </button>
          </div>
          <div
            ref={scrollRef}
            className="ai-conversation-scroll max-h-[min(28rem,calc(100svh-8rem))] overflow-y-auto px-4 pb-4"
          >
            <div className="flex flex-col gap-4">
              {messages.map((message) => {
                const text = messageText(message);
                if (message.role === "user") {
                  return (
                    <div
                      key={message.id}
                      className="ml-auto max-w-[82%] rounded-2xl rounded-br-md bg-foreground/88 px-3.5 py-2.5 text-[13px] font-medium leading-5 text-background shadow-sm backdrop-blur-md"
                    >
                      {text}
                    </div>
                  );
                }
                if (message.role === "assistant") {
                  return (
                    <AssistantMessage
                      key={message.id}
                      message={message}
                      onSourceClick={toggleSource}
                    />
                  );
                }
                return null;
              })}
              {showThinking && lastMessage?.role === "user" ? (
                <ThinkingState />
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export function AiChatWorkspace() {
  const [chatState, setChatState] = useState<StoredChatState | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  useEffect(() => {
    setChatState(readStoredChatState());
  }, []);

  useEffect(() => {
    if (!chatState) return;
    try {
      window.localStorage.setItem(
        CHAT_STORAGE_KEY,
        JSON.stringify({
          activeId: chatState.activeId,
          conversations: chatState.conversations.slice(
            0,
            MAX_SAVED_CONVERSATIONS,
          ),
        }),
      );
    } catch {
      // History remains available for the current session.
    }
  }, [chatState]);

  const activeConversation = useMemo(
    () =>
      chatState?.conversations.find(
        (conversation) => conversation.id === chatState.activeId,
      ) ?? null,
    [chatState],
  );

  const updateMessages = useCallback(
    (conversationId: string, messages: ChatMessage[]) => {
      setChatState((current) => {
        if (!current) return current;
        return {
          ...current,
          conversations: current.conversations
            .map((conversation) =>
              conversation.id === conversationId
                ? {
                    ...conversation,
                    title: conversationTitle(messages),
                    updatedAt: new Date().toISOString(),
                    messages,
                  }
                : conversation,
            )
            .toSorted(
              (a, b) =>
                new Date(b.updatedAt).getTime() -
                new Date(a.updatedAt).getTime(),
            ),
        };
      });
    },
    [],
  );

  const updateActiveMessages = useCallback(
    (messages: ChatMessage[]) => {
      if (chatState?.activeId) {
        updateMessages(chatState.activeId, messages);
      }
    },
    [chatState?.activeId, updateMessages],
  );

  function startNewConversation() {
    const conversation = createConversation();
    setChatState((current) => ({
      activeId: conversation.id,
      conversations: [conversation, ...(current?.conversations ?? [])],
    }));
    setChatOpen(false);
  }

  function selectConversation(conversationId: string) {
    setChatState((current) =>
      current ? { ...current, activeId: conversationId } : current,
    );
    setChatOpen(true);
    setHistoryOpen(false);
  }

  function deleteConversation(conversationId: string) {
    setChatState((current) => {
      if (!current) return current;
      const remaining = current.conversations.filter(
        (conversation) => conversation.id !== conversationId,
      );
      if (remaining.length > 0) {
        return {
          activeId:
            current.activeId === conversationId
              ? remaining[0]!.id
              : current.activeId,
          conversations: remaining,
        };
      }
      const fresh = createConversation();
      return { activeId: fresh.id, conversations: [fresh] };
    });
  }

  if (!chatState || !activeConversation) return null;

  return (
    <>
      <ConversationSearch
        key={activeConversation.id}
        conversation={activeConversation}
        open={chatOpen}
        onOpenChange={setChatOpen}
        onMessagesChange={updateActiveMessages}
        onHistoryOpen={() => setHistoryOpen(true)}
        onNewConversation={startNewConversation}
      />

      <aside
        aria-label="Saved AI conversations"
        className={cn(
          "ai-history-glass fixed bottom-4 left-0 top-[7.5rem] z-40 flex w-[15.5rem] flex-col overflow-hidden rounded-r-[1.75rem] border border-l-0 border-white/60 bg-background/44 shadow-[inset_0_1px_0_rgba(255,255,255,0.75),0_18px_55px_rgba(65,54,40,0.10)] backdrop-blur-2xl transition duration-300",
          historyOpen
            ? "translate-x-0 opacity-100"
            : "-translate-x-[calc(100%+1rem)] opacity-0",
        )}
      >
        <div className="flex items-center justify-between gap-3 px-4 pb-3 pt-4">
          <div>
            <p className="font-serif text-base font-semibold tracking-[-0.02em] text-foreground">
              Conversations
            </p>
            <p className="text-[10px] text-muted-foreground">
              Saved on this device
            </p>
          </div>
          <button
            type="button"
            aria-label="Close conversation history"
            className="grid size-8 cursor-pointer place-items-center rounded-full text-muted-foreground transition hover:bg-background/50 hover:text-foreground"
            onClick={() => setHistoryOpen(false)}
          >
            <PanelLeftClose className="size-4" />
          </button>
        </div>

        <div className="px-3">
          <Button
            type="button"
            variant="secondary"
            className="w-full cursor-pointer justify-start rounded-xl bg-background/45 shadow-sm hover:bg-background/65"
            onClick={startNewConversation}
          >
            <Plus data-icon="inline-start" />
            New conversation
          </Button>
        </div>

        <div className="mt-4 flex items-center gap-2 px-4 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          <History className="size-3.5" />
          Recent
        </div>

        <div className="mt-2 min-h-0 flex-1 overflow-y-auto px-2 pb-3">
          <div className="flex flex-col gap-1">
            {chatState.conversations.map((conversation) => {
              const active = conversation.id === chatState.activeId;
              const answerCount = conversation.messages.filter(
                (message) => message.role === "assistant",
              ).length;
              return (
                <div
                  key={conversation.id}
                  className={cn(
                    "group/history flex items-start rounded-xl transition",
                    active
                      ? "bg-foreground/88 text-background shadow-sm"
                      : "text-foreground hover:bg-background/40",
                  )}
                >
                  <button
                    type="button"
                    className="min-w-0 flex-1 cursor-pointer px-3 py-2.5 text-left"
                    onClick={() => selectConversation(conversation.id)}
                  >
                    <span className="block truncate text-xs font-semibold">
                      {conversation.title}
                    </span>
                    <span
                      className={cn(
                        "mt-1 block text-[9px]",
                        active
                          ? "text-background/60"
                          : "text-muted-foreground",
                      )}
                    >
                      {formatConversationTime(conversation.updatedAt)}
                      {answerCount > 0
                        ? ` · ${answerCount} answer${answerCount === 1 ? "" : "s"}`
                        : ""}
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${conversation.title}`}
                    className={cn(
                      "mr-1 mt-1 grid size-7 shrink-0 cursor-pointer place-items-center rounded-lg opacity-0 transition focus-visible:opacity-100 group-hover/history:opacity-100",
                      active
                        ? "text-background/60 hover:bg-background/10 hover:text-background"
                        : "text-muted-foreground hover:bg-background/50 hover:text-destructive",
                    )}
                    onClick={() => deleteConversation(conversation.id)}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </aside>

      {historyOpen ? (
        <button
          type="button"
          aria-label="Close conversation history"
          className="fixed inset-0 z-[35] cursor-default bg-black/5 lg:hidden"
          onClick={() => setHistoryOpen(false)}
        />
      ) : null}
    </>
  );
}

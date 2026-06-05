"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import {
  ArrowLeftIcon,
  ArrowUpTrayIcon,
  PlusIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";

import { Button } from "@dumpd/ui/components/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@dumpd/ui/components/dialog";
import { Input } from "@dumpd/ui/components/input";
import { cn } from "@dumpd/ui/lib/utils";

import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import {
  BubbleChatIcon,
  Image02Icon,
  Link04Icon,
  Note02Icon,
  Pdf01Icon,
} from "@hugeicons/core-free-icons";

type DumpType = "link" | "photo" | "thought" | "note" | "pdf";
type View = "picker" | DumpType;

export type DumpPayload =
  | { type: "link"; url: string; title?: string }
  | { type: "photo"; file: File; caption?: string }
  | { type: "thought"; text: string }
  | { type: "note"; title: string; body: string }
  | { type: "pdf"; file: File; title?: string };

type AddDumpMenuProps = {
  onCreate?: (payload: DumpPayload) => void;
};

type DumpOption = {
  type: DumpType;
  label: string;
  description: string;
  icon: IconSvgElement;
};

const options: DumpOption[] = [
  { type: "link", label: "Link", description: "Bookmark a URL", icon: Link04Icon },
  { type: "photo", label: "Photo", description: "Upload an image", icon: Image02Icon },
  { type: "thought", label: "Thought", description: "A quick spark", icon: BubbleChatIcon },
  { type: "note", label: "Note", description: "Something longer", icon: Note02Icon },
  { type: "pdf", label: "PDF", description: "Attach a document", icon: Pdf01Icon },
];

export function AddDumpMenu({ onCreate }: AddDumpMenuProps) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("picker");
  const [direction, setDirection] = useState<1 | -1>(1);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      window.setTimeout(() => {
        setView("picker");
        setDirection(1);
      }, 220);
    }
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "d" && event.key !== "D") return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (
          tag === "INPUT" ||
          tag === "TEXTAREA" ||
          tag === "SELECT" ||
          target.isContentEditable
        ) {
          return;
        }
      }
      event.preventDefault();
      setOpen((prev) => {
        const next = !prev;
        if (!next) {
          window.setTimeout(() => {
            setView("picker");
            setDirection(1);
          }, 220);
        }
        return next;
      });
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function goTo(next: View) {
    setDirection(next === "picker" ? -1 : 1);
    setView(next);
  }

  function handleSubmit(payload: DumpPayload) {
    onCreate?.(payload);
    toast.success(`${labelFor(payload.type)} dumped`);
    handleOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button type="button" size="sm" className="cursor-pointer">
            <PlusIcon data-icon="inline-start" />
            Add Dump
          </Button>
        }
      />
      <DialogContent className="max-w-md overflow-hidden p-0 shadow-none before:hidden bg-popover">
        <DialogTitle className="sr-only">Add a dump</DialogTitle>
        <DialogDescription className="sr-only">
          Pick how you want to dump something.
        </DialogDescription>

        <div className="flex items-center justify-between gap-2 px-5 pt-4 pb-2">
          <div className="flex items-center gap-1.5">
            <AnimatePresence initial={false} mode="popLayout">
              {view !== "picker" ? (
                <motion.div
                  key="back"
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -6 }}
                  transition={{ duration: 0.15 }}
                >
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => goTo("picker")}
                    className="cursor-pointer rounded-full"
                    aria-label="Back to dump types"
                  >
                    <ArrowLeftIcon />
                  </Button>
                </motion.div>
              ) : null}
            </AnimatePresence>
            <motion.p
              key={view}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18 }}
              className="text-sm font-semibold text-foreground"
            >
              {view === "picker" ? "Add a dump" : `New ${labelFor(view as DumpType)}`}
            </motion.p>
          </div>
          <DialogClose
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="cursor-pointer rounded-full text-muted-foreground"
                aria-label="Close"
              >
                <XMarkIcon />
              </Button>
            }
          />
        </div>

        <div className="relative h-80 overflow-hidden px-5 pb-5">
          <AnimatePresence initial={false} mode="wait" custom={direction}>
            {view === "picker" ? (
              <motion.div
                key="picker"
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                className="absolute inset-x-5 top-0 bottom-5"
              >
                <Picker onPick={(type) => goTo(type)} />
              </motion.div>
            ) : (
              <motion.div
                key={view}
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                className="absolute inset-x-5 top-0 bottom-5"
              >
                <DumpForm type={view as DumpType} onSubmit={handleSubmit} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const slideVariants = {
  enter: (dir: 1 | -1) => ({ opacity: 0, x: dir * 24 }),
  center: { opacity: 1, x: 0 },
  exit: (dir: 1 | -1) => ({ opacity: 0, x: dir * -24 }),
};

function labelFor(type: DumpType) {
  return options.find((o) => o.type === type)?.label ?? type;
}

function Picker({ onPick }: { onPick: (type: DumpType) => void }) {
  return (
    <div className="grid h-full grid-cols-2 gap-2 content-start">
      {options.map(({ type, label, description, icon }) => (
        <button
          key={type}
          type="button"
          onClick={() => onPick(type)}
          className={cn(
            "flex items-start gap-3 rounded-xl border border-border/60 bg-card p-3 text-left",
            "hover:bg-muted/50 hover:border-border",
            "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 outline-none cursor-pointer",
          )}
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground">
            <HugeiconsIcon icon={icon} size={18} strokeWidth={1.75} />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-foreground">{label}</span>
            <span className="block truncate text-[11px] text-muted-foreground">{description}</span>
          </span>
        </button>
      ))}
      <div className="flex items-center rounded-xl border border-dashed border-border/50 p-3 text-[11px] text-muted-foreground">
        More coming soon
      </div>
    </div>
  );
}

function DumpForm({
  type,
  onSubmit,
}: {
  type: DumpType;
  onSubmit: (payload: DumpPayload) => void;
}) {
  switch (type) {
    case "link":
      return <LinkForm onSubmit={onSubmit} />;
    case "photo":
      return <PhotoForm onSubmit={onSubmit} />;
    case "thought":
      return <ThoughtForm onSubmit={onSubmit} />;
    case "note":
      return <NoteForm onSubmit={onSubmit} />;
    case "pdf":
      return <PdfForm onSubmit={onSubmit} />;
  }
}

function LinkForm({ onSubmit }: { onSubmit: (p: DumpPayload) => void }) {
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const parsed = useMemo(() => parseUrl(url), [url]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) return;
    onSubmit({ type: "link", url: trimmed, title: title.trim() || undefined });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <Field label="URL">
        <Input
          autoFocus
          type="url"
          inputMode="url"
          placeholder="https://..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          required
        />
      </Field>
      <LinkPreview parsed={parsed} />
      <Field label="Title" optional>
        <Input
          type="text"
          placeholder="Optional label"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </Field>
      <SubmitRow disabled={!parsed} label="Save link" />
    </form>
  );
}

function parseUrl(value: string): URL | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(candidate);
    if (!url.hostname.includes(".")) return null;
    return url;
  } catch {
    return null;
  }
}

function LinkPreview({ parsed }: { parsed: URL | null }) {
  return (
    <AnimatePresence initial={false} mode="wait">
      {parsed ? (
        <motion.div
          key={parsed.hostname + parsed.pathname}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.16 }}
          className="flex items-center gap-3 rounded-xl border border-border/60 bg-card p-2.5 shadow-[0_1px_0_color-mix(in_oklab,var(--foreground)_4%,transparent)]"
        >
          <div className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`https://www.google.com/s2/favicons?sz=64&domain=${parsed.hostname}`}
              alt=""
              className="size-5"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.visibility = "hidden";
              }}
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">
              {parsed.hostname.replace(/^www\./, "")}
            </p>
            <p className="truncate text-[11px] text-muted-foreground">
              {parsed.pathname === "/" && !parsed.search ? parsed.href : parsed.pathname + parsed.search}
            </p>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function PhotoForm({ onSubmit }: { onSubmit: (p: DumpPayload) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return;
    onSubmit({ type: "photo", file, caption: caption.trim() || undefined });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <Field label="Photo">
        <FilePicker
          accept="image/*"
          file={file}
          onChange={setFile}
          hint="PNG, JPG, GIF, WEBP"
        />
      </Field>
      <Field label="Caption" optional>
        <Input
          type="text"
          placeholder="Say something about it"
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
        />
      </Field>
      <SubmitRow disabled={!file} label="Save photo" />
    </form>
  );
}

function ThoughtForm({ onSubmit }: { onSubmit: (p: DumpPayload) => void }) {
  const [text, setText] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    onSubmit({ type: "thought", text: trimmed });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <Field label="What's on your mind">
        <Textarea
          autoFocus
          rows={5}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type the thought before it slips away..."
          required
        />
      </Field>
      <SubmitRow disabled={!text.trim()} label="Save thought" />
    </form>
  );
}

function NoteForm({ onSubmit }: { onSubmit: (p: DumpPayload) => void }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedTitle = title.trim();
    const trimmedBody = body.trim();
    if (!trimmedTitle || !trimmedBody) return;
    onSubmit({ type: "note", title: trimmedTitle, body: trimmedBody });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <Field label="Title">
        <Input
          autoFocus
          type="text"
          placeholder="Give it a name"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
      </Field>
      <Field label="Body">
        <Textarea
          rows={6}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Markdown welcome"
          required
        />
      </Field>
      <SubmitRow disabled={!title.trim() || !body.trim()} label="Save note" />
    </form>
  );
}

function PdfForm({ onSubmit }: { onSubmit: (p: DumpPayload) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return;
    onSubmit({ type: "pdf", file, title: title.trim() || undefined });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <Field label="PDF file">
        <FilePicker
          accept="application/pdf"
          file={file}
          onChange={setFile}
          hint="Up to ~25MB"
        />
      </Field>
      <Field label="Title" optional>
        <Input
          type="text"
          placeholder="Optional label"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </Field>
      <SubmitRow disabled={!file} label="Save PDF" />
    </form>
  );
}

function Field({
  label,
  optional,
  children,
}: {
  label: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex items-center justify-between text-[11px] font-medium text-muted-foreground">
        <span>{label}</span>
        {optional ? <span className="text-[10px] opacity-60">optional</span> : null}
      </span>
      {children}
    </label>
  );
}

function Textarea({
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cn(
        "min-h-20 w-full rounded-2xl border border-transparent bg-input/50 px-3 py-2 text-sm leading-relaxed outline-none transition-[color,box-shadow] duration-200 placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30",
        className,
      )}
    />
  );
}

function FilePicker({
  accept,
  file,
  onChange,
  hint,
}: {
  accept: string;
  file: File | null;
  onChange: (file: File | null) => void;
  hint?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  function pick() {
    inputRef.current?.click();
  }

  function handle(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.files?.[0] ?? null;
    onChange(next);
  }

  return (
    <button
      type="button"
      onClick={pick}
      className={cn(
        "group flex w-full items-center gap-3 rounded-2xl border border-dashed px-3 py-3 text-left transition cursor-pointer",
        "border-border/60 bg-input/30 hover:border-border hover:bg-input/50",
        "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 outline-none",
      )}
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-card text-muted-foreground group-hover:text-foreground">
        <ArrowUpTrayIcon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">
          {file ? file.name : "Choose a file"}
        </span>
        <span className="block truncate text-[11px] text-muted-foreground">
          {file ? `${formatBytes(file.size)} • click to replace` : hint ?? "Click to browse"}
        </span>
      </span>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={handle}
      />
    </button>
  );
}

function SubmitRow({ label, disabled }: { label: string; disabled?: boolean }) {
  return (
    <div className="flex justify-end pt-1">
      <Button type="submit" size="sm" disabled={disabled} className="cursor-pointer">
        {label}
      </Button>
    </div>
  );
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

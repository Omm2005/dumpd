"use client";

import { useState, type FormEvent } from "react";
import { Grid2X2, Home, Plus, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@dumpd/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@dumpd/ui/components/dialog";
import { Input } from "@dumpd/ui/components/input";

export type WorldRecord = {
  id: string;
  name: string;
  isDefault: boolean;
  color: WorldColor;
  positionX: number;
  positionY: number;
  itemCount: number;
  itemTypes: string[];
  createdAt: string;
  updatedAt: string;
};

export type WorldColor =
  | "amber"
  | "sky"
  | "rose"
  | "emerald"
  | "violet"
  | "stone";

export const worldColors: Array<{
  value: WorldColor;
  label: string;
  className: string;
}> = [
  { value: "amber", label: "Amber", className: "bg-amber-400" },
  { value: "sky", label: "Sky", className: "bg-sky-400" },
  { value: "rose", label: "Rose", className: "bg-rose-400" },
  { value: "emerald", label: "Emerald", className: "bg-emerald-400" },
  { value: "violet", label: "Violet", className: "bg-violet-400" },
  { value: "stone", label: "Stone", className: "bg-stone-400" },
];

type WorldSwitcherProps = {
  worlds: WorldRecord[];
  activeWorldId: string | null;
  onHome: () => void;
  onSelect: (worldId: string) => void;
  onCreated: (world: WorldRecord) => void;
  onDeleted: (worldId: string) => void;
};

export function WorldSwitcher({
  worlds,
  activeWorldId,
  onHome,
  onSelect,
  onCreated,
  onDeleted,
}: WorldSwitcherProps) {
  const [createOpen, setCreateOpen] = useState(false);
  const [worldToDelete, setWorldToDelete] = useState<WorldRecord | null>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState<WorldColor>("amber");
  const [isCreating, setIsCreating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = name.trim();

    if (!trimmedName) {
      return;
    }

    setIsCreating(true);

    try {
      const response = await fetch("/api/worlds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmedName, color }),
      });
      const payload = (await response.json()) as
        | { world: WorldRecord }
        | { error?: string };

      if (!response.ok || !("world" in payload)) {
        throw new Error(
          "error" in payload && payload.error
            ? payload.error
            : "Failed to create world.",
        );
      }

      onCreated(payload.world);
      setName("");
      setColor("amber");
      setCreateOpen(false);
      toast.success("World created.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to create world.",
      );
    } finally {
      setIsCreating(false);
    }
  }

  async function handleDelete() {
    if (!worldToDelete) {
      return;
    }

    setIsDeleting(true);

    try {
      const response = await fetch(`/api/worlds/${worldToDelete.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(payload?.error ?? "Failed to delete world.");
      }

      onDeleted(worldToDelete.id);
      setWorldToDelete(null);
      toast.success("World deleted.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to delete world.",
      );
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <>
      <nav
        aria-label="World tabs"
        className="flex max-w-[calc(100vw-1.5rem)] items-center gap-1 overflow-x-auto rounded-[1.4rem] bg-muted/70 p-1 shadow-sm backdrop-blur-xl"
      >
        <button
          type="button"
          aria-label="All worlds"
          aria-current={activeWorldId === null ? "page" : undefined}
          className={`grid size-9 shrink-0 cursor-pointer place-items-center rounded-2xl transition ${
            activeWorldId === null
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:bg-card/60 hover:text-foreground"
          }`}
          onClick={onHome}
        >
          <Home className="size-4" strokeWidth={2.2} />
        </button>

        {worlds.map((world) => {
          const isActive = world.id === activeWorldId;

          return (
            <div
              key={world.id}
              className={`flex h-9 shrink-0 items-center rounded-2xl transition ${
                isActive
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-card/60 hover:text-foreground"
              } ${world.isDefault ? "pr-3" : ""}
                  `}
            >
              <button
                type="button"
                className="flex h-full max-w-44 cursor-pointer items-center gap-2 pl-3 pr-1 text-sm font-semibold"
                onClick={() => onSelect(world.id)}
              >
                <span
                  className={`size-2.5 shrink-0 rounded-full ${
                    worldColors.find((color) => color.value === world.color)
                      ?.className ?? "bg-amber-400"
                  }`}
                />
                <span className="truncate">{world.name}</span>
              </button>
              {!world.isDefault ? (
                <button
                  type="button"
                  aria-label={`Delete ${world.name}`}
                  className="mr-1 grid size-7 cursor-pointer place-items-center rounded-xl text-muted-foreground transition hover:bg-muted hover:text-foreground"
                  onClick={() => setWorldToDelete(world)}
                >
                  <X className="size-3.5" strokeWidth={2.2} />
                </button>
              ) : null}
            </div>
          );
        })}

        <button
          type="button"
          aria-label="Create world"
          className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-2xl text-muted-foreground transition hover:bg-card/60 hover:text-foreground"
          onClick={() => setCreateOpen(true)}
        >
          <Plus className="size-4" strokeWidth={2.2} />
        </button>
      </nav>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <form className="grid gap-6" onSubmit={handleCreate}>
            <DialogHeader>
              <DialogTitle>Create a world</DialogTitle>
              <DialogDescription>
                Worlds keep separate collections of notes and other dumps.
              </DialogDescription>
            </DialogHeader>
            <Input
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Work, Ideas, Research"
              maxLength={60}
            />
            <fieldset>
              <legend className="mb-2 text-xs font-medium text-muted-foreground">
                Folder color
              </legend>
              <div className="flex gap-2">
                {worldColors.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    aria-label={option.label}
                    aria-pressed={color === option.value}
                    className={`size-7 cursor-pointer rounded-full border-2 transition ${
                      option.className
                    } ${
                      color === option.value
                        ? "border-foreground ring-2 ring-background"
                        : "border-transparent hover:scale-110"
                    }`}
                    onClick={() => setColor(option.value)}
                  />
                ))}
              </div>
            </fieldset>
            <DialogFooter>
              <Button type="submit" disabled={isCreating || !name.trim()}>
                {isCreating ? "Creating..." : "Create world"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(worldToDelete)}
        onOpenChange={(open) => {
          if (!open && !isDeleting) {
            setWorldToDelete(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {worldToDelete?.name}?</DialogTitle>
            <DialogDescription>
              This permanently deletes the world and all items stored inside it.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isDeleting}
              onClick={() => setWorldToDelete(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={isDeleting}
              onClick={handleDelete}
            >
              {isDeleting ? "Deleting..." : "Delete world"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

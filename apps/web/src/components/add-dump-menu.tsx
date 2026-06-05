"use client";

import { PlusIcon } from "@heroicons/react/24/outline";

import { Button } from "@dumpd/ui/components/button";

type AddDumpMenuProps = {
  onSelect?: () => void;
};

export function AddDumpMenu({ onSelect }: AddDumpMenuProps) {
  return (
    <Button
      type="button"
      size="sm"
      className="cursor-pointer"
      onClick={() => onSelect?.()}
    >
      <PlusIcon data-icon="inline-start" />
      Add Dump
    </Button>
  );
}

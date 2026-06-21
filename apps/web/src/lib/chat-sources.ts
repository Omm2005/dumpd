import type { UIMessage } from "ai";

export type ChatSource = {
  sourceId: string;
  worldId: string | null;
  title: string;
  modality: string;
  url: string | null;
  previewUrl?: string | null;
};

export type ChatMessage = UIMessage<
  unknown,
  {
    sources: ChatSource[];
  }
>;

export const SOURCE_FOCUS_EVENT = "dumpd:source-focus";
export const MANAGE_DUMPS_EVENT = "dumpd:manage-dumps";

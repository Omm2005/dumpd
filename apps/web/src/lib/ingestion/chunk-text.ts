export type TextChunk = {
  content: string;
  chunkIndex: number;
  tokenCount: number;
};

const CHUNK_SIZE = 512;
const CHUNK_OVERLAP = 64;
const UNCHUNKED_TYPES = new Set(["image", "video", "audio"]);

export function countTokens(text: string) {
  return text.match(/\p{L}+(?:['’]\p{L}+)*|\p{N}+(?:[.,]\p{N}+)*|[^\s]/gu)
    ?.length ?? 0;
}

function splitSentences(text: string) {
  if (typeof Intl.Segmenter === "function") {
    const segmenter = new Intl.Segmenter("en", { granularity: "sentence" });
    return [...segmenter.segment(text)]
      .map(({ segment }) => segment.trim())
      .filter(Boolean);
  }

  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function toChunk(content: string, chunkIndex: number): TextChunk {
  return {
    content,
    chunkIndex,
    tokenCount: countTokens(content),
  };
}

export function chunkSourceText(
  rawText: string,
  sourceType: string,
  fallbackText = "Untitled source",
): TextChunk[] {
  const text = rawText.trim() || fallbackText.trim() || "Untitled source";

  if (UNCHUNKED_TYPES.has(sourceType) || countTokens(text) <= CHUNK_SIZE) {
    return [toChunk(text, 0)];
  }

  const sentences = splitSentences(text).map((content) => ({
    content,
    tokenCount: countTokens(content),
  }));
  const result: TextChunk[] = [];
  let start = 0;

  while (start < sentences.length) {
    let end = start;
    let tokenCount = 0;

    while (end < sentences.length) {
      const nextCount = sentences[end]!.tokenCount;
      if (end > start && tokenCount + nextCount > CHUNK_SIZE) break;
      tokenCount += nextCount;
      end += 1;
      if (tokenCount >= CHUNK_SIZE) break;
    }

    const content = sentences
      .slice(start, end)
      .map((sentence) => sentence.content)
      .join(" ");
    result.push(toChunk(content, result.length));

    if (end >= sentences.length) break;

    let overlapStart = end;
    let overlapTokens = 0;
    while (overlapStart > start) {
      const previousCount = sentences[overlapStart - 1]!.tokenCount;
      if (overlapTokens > 0 && overlapTokens + previousCount > CHUNK_OVERLAP) {
        break;
      }
      overlapTokens += previousCount;
      overlapStart -= 1;
      if (overlapTokens >= CHUNK_OVERLAP) break;
    }

    start = overlapStart === start ? end : overlapStart;
  }

  return result.length > 0 ? result : [toChunk(text, 0)];
}

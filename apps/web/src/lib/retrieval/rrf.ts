export type RankedItem = {
  chunkId: string;
  score: number;
};

export function reciprocalRankFusion<T extends RankedItem>(
  lists: T[][],
  k = 60,
) {
  const byChunkId = new Map<string, T & { rrfScore: number }>();

  for (const list of lists) {
    const ranked = [...list].sort((a, b) => b.score - a.score);
    ranked.forEach((item, index) => {
      const existing = byChunkId.get(item.chunkId);
      const contribution = 1 / (index + 1 + k);
      if (existing) {
        existing.rrfScore += contribution;
      } else {
        byChunkId.set(item.chunkId, {
          ...item,
          rrfScore: contribution,
        });
      }
    });
  }

  return [...byChunkId.values()].sort((a, b) => b.rrfScore - a.rrfScore);
}

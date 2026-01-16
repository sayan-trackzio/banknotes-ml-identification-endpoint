import qdrant from './qdrantClient.js';

export async function annSearch(qVecs) {
  if (process.env.LOG_TIMERS === 'true') console.time("==> Time taken by ANN Search");
  try {
    const itemMap = new Map();
    const collection = process.env.QDRANT_COLLECTION;
    if (!collection) {
      throw new Error('QDRANT_COLLECTION environment variable is not set.');
    }

    const ANN_OVERFETCH_SIZE = Number(process.env.ANN_OVERFETCH_SIZE ?? 1000);
    const ANN_RECALL_SIZE = Number(process.env.ANN_RECALL_SIZE ?? 300);

    // Prepare batch search requests
    const searches = qVecs.map(vector => ({
      query: vector,
      limit: ANN_RECALL_SIZE,
      with_payload: true,
      with_vector: false,
      params: {
        hnsw_ef: ANN_OVERFETCH_SIZE
      }
    }));

    // Perform batch ANN search
    const batchResults = await qdrant.queryBatch(collection, { searches });

    for (const batch of batchResults) {
      if (!batch || !batch.points) continue;

      for (const hit of batch.points) {
        const itemId = hit.payload.archetypeId;
        const score = hit.score;

        const prev = itemMap.get(itemId);
        if (!prev || score > prev.ann_score) {
          itemMap.set(itemId, { item_id: itemId, ann_score: score, payload: hit.payload });
        }
      }
    }

    return [...itemMap.values()]
      .sort((a, b) => b.ann_score - a.ann_score)
      .map((c, i) => ({ ...c, ann_rank: i + 1 }));
  } finally {
    if (process.env.LOG_TIMERS === 'true') console.timeEnd("==> Time taken by ANN Search");
  }
}

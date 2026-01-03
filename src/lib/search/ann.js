import qdrant from '../qdrantClient.js';

export async function annSearch(qVecs) {
  const coinMap = new Map();
  const collection = process.env.QDRANT_COLLECTION;
  if (!collection) {
    throw new Error('QDRANT_COLLECTION environment variable is not set.');
  }

  const ANN_OVERFETCH_SIZE = Number(process.env.ANN_OVERFETCH_SIZE ?? 2000);

  // Prepare batch search requests
  const searches = qVecs.map(vector => ({
    query: vector,
    limit: ANN_OVERFETCH_SIZE,
    with_payload: true,
    with_vector: false
  }));

  // Perform batch ANN search
  const batchResults = await qdrant.queryBatch(collection, { searches });

  for (const batch of batchResults) {
    if (!batch || !batch.points) continue;

    for (const hit of batch.points) {
      const coinId = hit.payload.archetypeId;
      const score = hit.score;

      const prev = coinMap.get(coinId);
      if (!prev || score > prev.ann_score) {
        coinMap.set(coinId, { coin_id: coinId, ann_score: score, payload: hit.payload });
      }
    }
  }

  return [...coinMap.values()]
    .sort((a, b) => b.ann_score - a.ann_score)
    .map((c, i) => ({ ...c, ann_rank: i + 1 }));
}
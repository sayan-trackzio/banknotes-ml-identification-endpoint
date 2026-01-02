// Minimal search service stubs (ESM)
// Replace with real ANN search / bipartite matching implementations.
// Exports:
//  - fetchANNResults(queryVectors, topK): returns [candidatesA, candidatesB]
//      where each candidates list is an array of { id, score, payload }
//  - fetchBipartiteMatchResults(queryVectors, candidateIds, topN): returns an array of selected ids

import qdrant from './qdrantClient.js';

export async function fetchANNResults(queryVectors, topK = 300) {
  const collection = process.env.QDRANT_COLLECTION;
  if (!collection) {
    throw new Error('QDRANT_COLLECTION environment variable is not set.');
  }

  const overfetchingFactor = Number(process.env.TOP_K_OVERFETCH_FACTOR ?? 5);

  // Prepare batch search requests
  const searches = queryVectors.map(vector => ({
    query: vector,
    limit: topK * overfetchingFactor,
    with_payload: true,
    with_vector: false
  }));

  // Perform batch ANN search
  const batchResults = await qdrant.queryBatch(collection, {
    searches
  });

  // Map results to the expected format: { id, score, payload }
  const candidatesA = batchResults[0].points.map(point => ({
    id: point.id,
    score: point.score,
    payload: point.payload
  }));

  const candidatesB = batchResults[1].points.map(point => ({
    id: point.id,
    score: point.score,
    payload: point.payload
  }));

  return [candidatesA, candidatesB];
}

export async function fetchBipartiteMatchResults(queryVectors, candidateIds, topN = 5) {
  // Placeholder: simple deterministic fallback: return topN candidateIds (or empty list)
  if (!Array.isArray(candidateIds)) return [];
  return candidateIds.slice(0, topN);
}

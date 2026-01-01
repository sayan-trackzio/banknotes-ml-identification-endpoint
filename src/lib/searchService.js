// Minimal search service stubs (ESM)
// Replace with real ANN search / bipartite matching implementations.
// Exports:
//  - fetchANNResults(queryVectors, topK): returns [candidatesA, candidatesB]
//      where each candidates list is an array of { id, score, payload }
//  - fetchBipartiteMatchResults(queryVectors, candidateIds, topN): returns an array of selected ids

export async function fetchANNResults(queryVectors, topK = 300) {
  // Placeholder: return empty candidate lists. Replace with calls to Qdrant/FAISS/Annoy/etc.
  return [[], []];
}

export async function fetchBipartiteMatchResults(queryVectors, candidateIds, topN = 5) {
  // Placeholder: simple deterministic fallback: return topN candidateIds (or empty list)
  if (!Array.isArray(candidateIds)) return [];
  return candidateIds.slice(0, topN);
}

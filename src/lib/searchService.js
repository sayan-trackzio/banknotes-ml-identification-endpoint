// Minimal search service stubs (ESM)
// Replace with real ANN search / bipartite matching implementations.
// Exports:
//  - fetchANNResults(queryVectors, topK): returns [candidatesA, candidatesB]
//      where each candidates list is an array of { id, score, payload }
//  - fetchBipartiteMatchResults(queryVectors, candidateIds, topN): returns an array of selected ids

import qdrant from './qdrantClient.js';

export async function fetchANNResults(queryVectors, topK = 300) {
  try {
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
  } catch (error) {
    console.error('==> Error in fetchANNResults:', error);
    throw error;
  }
}

export async function fetchBipartiteMatchResults(queryVectors, candidateArchetypeIds, topN = 5) {
  try {
    if (!Array.isArray(candidateArchetypeIds) || candidateArchetypeIds.length === 0) return [];
    
    const collection = process.env.QDRANT_COLLECTION;
    if (!collection) {
      throw new Error('QDRANT_COLLECTION environment variable is not set.');
    }

    const [Q1, Q2] = queryVectors;

    // Helper: cosine similarity (assumes vectors are already normalized)
    const cosineSim = (a, b) => {
      let dot = 0, na = 0, nb = 0;
      for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        na += a[i] * a[i];
        nb += b[i] * b[i];
      }
      const denom = Math.sqrt(na) * Math.sqrt(nb) || 1e-12;
      return Math.max(-1, Math.min(1, dot / denom));
    };

    // Fetch all candidate points by archetypeId
    const filter = {
      should: candidateArchetypeIds.map(id => ({
        key: 'archetypeId',
        match: { value: id }
      }))
    };

    const scrollResult = await qdrant.scroll(collection, {
      filter,
      with_vector: true,
      with_payload: true,
      limit: candidateArchetypeIds.length * 2 // 2 vectors per archetype
    });

    // Group points by archetypeId
    const archetypeGroups = {};
    for (const point of scrollResult.points) {
      const archetypeId = point.payload.archetypeId;
      if (!archetypeGroups[archetypeId]) {
        archetypeGroups[archetypeId] = [];
      }
      archetypeGroups[archetypeId].push(point.vector);
    }

    // Compute bipartite matching score for each archetype
    const scores = [];
    for (const archetypeId of candidateArchetypeIds) {
      const vectors = archetypeGroups[archetypeId];
      if (!vectors || vectors.length < 2) continue; // Skip if not 2 vectors

      const [C1, C2] = vectors;

      // Compute pairwise similarities
      const s11 = cosineSim(Q1, C1);
      const s12 = cosineSim(Q1, C2);
      const s21 = cosineSim(Q2, C1);
      const s22 = cosineSim(Q2, C2);

      // Best 1-1 matching
      const inOrder = s11 + s22;
      const cross = s12 + s21;
      const score = 0.5 * Math.max(inOrder, cross);

      scores.push({ archetypeId, score });
    }

    // Sort by score descending and return top N archetype IDs
    scores.sort((a, b) => b.score - a.score);
    // console.log("scores in bipartite matching: ", scores.slice(0, topN));
    // return scores.slice(0, topN) //.map(item => item.archetypeId);
    return scores; // to be sliced upstream
  } catch (error) {
    console.error('==> Error in fetchBipartiteMatchResults:', error);
    throw error;
  }
}

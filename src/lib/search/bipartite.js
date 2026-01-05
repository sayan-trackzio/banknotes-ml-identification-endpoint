import qdrant from '../qdrantClient.js';

// Fetch item vectors (2 per item)
async function fetchItemVectors(itemIds) {
  const collection = process.env.QDRANT_COLLECTION;
  if (!collection) {
    throw new Error('QDRANT_COLLECTION environment variable is not set.');
  }
  const res = await qdrant.scroll(collection, {
    filter: {
      must: [
        { key: "archetypeId", match: { any: itemIds } }
      ]
    },
    with_vector: true,
    with_payload: true,
    limit: itemIds.length * 2
  });

  const map = new Map();

  for (const p of res.points) {
    const itemId = p.payload.archetypeId;
    if (!map.has(itemId)) map.set(itemId, []);
    map.get(itemId).push(p.vector);
  }

  return map;
}

//  Cosine similarity (L2-normalized vectors assumed)
function cosine(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

// Bipartite score with gap
function bipartiteScore(qVecs, cVecs) {
  // qVecs = [q1, q2], cVecs = [c1, c2]
  const s11 = cosine(qVecs[0], cVecs[0]);
  const s12 = cosine(qVecs[0], cVecs[1]);
  const s21 = cosine(qVecs[1], cVecs[0]);
  const s22 = cosine(qVecs[1], cVecs[1]);

  const A = s11 + s22;
  const B = s12 + s21;

  return {
    bp_best: Math.max(A, B),
    bp_gap: Math.abs(A - B)
  };
}

// Add BP features to recall candidates set
export async function addBpScores(buffer, qVecs) {
  const itemIds = buffer.map(c => c.item_id);
  const itemVecMap = await fetchItemVectors(itemIds);

  return buffer.map(c => {
    const cVecs = itemVecMap.get(c.item_id);
    if (!cVecs || cVecs.length !== 2) {
      return { ...c, bp_best: 0, bp_gap: 0 };
    }

    const { bp_best, bp_gap } = bipartiteScore(qVecs, cVecs);
    return { ...c, bp_best, bp_gap };
  });
}
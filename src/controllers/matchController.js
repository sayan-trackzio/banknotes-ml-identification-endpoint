// Controller placeholder for /match
// The handler accepts files from req.files (array of uploaded files via multer)
import { generateEmbeddings } from '../lib/embeddingService.js';
import { fetchANNResults, fetchBipartiteMatchResults } from '../lib/searchService.js';
import { mergeCandidates, formatResults } from '../lib/resultUtils.js';

export async function match(req, res, next) {
  try {
    // TODO: implement matching logic
    // Access uploaded files as `req.files` (each has buffer, mimetype, originalname, etc.)

    const topK = parseInt(process.env.TOP_K || '300', 10);
    const topN = parseInt(process.env.TOP_N || '5', 10);

    // Optional numista query parameter (e.g., ?n=12345)
    const numistaQuery = req.query?.n ? String(req.query.n).trim() : null;

    // Utility to extract numeric part from strings like 'N# 12345'
    const extractNumistaNumber = (val) => {
      if (!val) return null;
      const m = String(val).match(/\d+/);
      return m ? m[0] : null;
    };

    // Basic validation of uploaded files before processing
    if (!req.files || !Array.isArray(req.files) || req.files.length < 2) {
      return res.status(400).json({
        error: true,
        reason: 'Two input files are required for matching'
      });
    }
    
    // Stage 0: Preprocessing (e.g., feature extraction)
    const [queryVectorA, queryVectorB] = await generateEmbeddings(req.files);

    // Stage 1.1: Candidate generation using ANN (top K)
    const [candidatesA, candidatesB] = await fetchANNResults([queryVectorA, queryVectorB], topK);
    // console.log(candidatesA[0]);
    

    // Stage 1.2: Merging candidates (UNION on payload field archetypeId) from both queries
    let candidates = mergeCandidates('archetypeId', candidatesA, candidatesB); // sorted by scores
    // console.log("==> raw candidates count", candidates[0]);
    

    // Stage 1.3: Soft trim to top K after merging
    candidates = candidates.slice(0, topK);
    const candidateArchetypeIds = candidates.map(c => String(c.payload?.archetypeId));
    // console.log(candidateArchetypeIds);

    // Stage 1 ranking: compute topK rank for optional numista query (1-based, 0 means not found)
    let topKRank = 0;
    if (numistaQuery) {
      const idx = candidates.findIndex(c => extractNumistaNumber(c?.payload?.archetypeDetails?.archetypeDetails?.numistaItemNumber) === String(numistaQuery));
      topKRank = idx === -1 ? 0 : idx + 1;
      console.info(`[Ranking] topK rank for numista ${numistaQuery}: ${topKRank}`);
    }

    let maxKScore = candidates[0]?.score;
    console.log('==> Max K Score: ', maxKScore);

    // Stage 2: Reranking using bipartite matching (top N)
    let topNResults = await fetchBipartiteMatchResults([queryVectorA, queryVectorB], candidateArchetypeIds, topN);
    // console.log("topNResults ==> ", topNResults, candidates[0])
    // Soft trim to top N:
    topNResults = topNResults.slice(0, topN);

    // Get payload for top N candidate ids from candidates array and score from topNResults
    const results = topNResults.map(({ archetypeId, score }) => {
      const { payload } = candidates.find(c => String(c.payload?.archetypeId) === String(archetypeId));
      return { payload, score };
    });
    
    // Stage 2 ranking: compute topN rank for the optional numista query
    let topNRank = 0;
    if (numistaQuery) {
      const idx = results.findIndex(r => extractNumistaNumber(r.payload?.archetypeDetails?.archetypeDetails?.numistaItemNumber) === String(numistaQuery));
      topNRank = idx === -1 ? 0 : idx + 1;
      console.info(`[Ranking] topN rank for numista ${numistaQuery}: ${topNRank}`);
    }

    let maxNScore = topNResults[0]?.score;
    console.log('==> Max N Score: ', maxNScore);

    // Format results as needed for response and send back
    return res.status(200).json({
      error: false,
      data: {
        imageUrls: [],
        matchesFoundCount: topNResults.length,
        matches: results.map(formatResults),
      },
      rank: numistaQuery ? {
        numista: numistaQuery ? Number(numistaQuery) : null,
        topK: topKRank,
        topN: topNRank,
        maxKScore,
        maxNScore,
      } : undefined
    });
  } catch (error) {
    console.error('==> Error in match controller:', error);
    return res.status(500).json({ error: true, reason: 'Internal server error' });
  }
}

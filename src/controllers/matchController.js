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

    // Basic validation of uploaded files before processing
    if (!req.files || !Array.isArray(req.files) || req.files.length < 2) {
      return res.status(400).json({
        error: true,
        reason: 'Two input files are required for matching'
      });
    }
    // console.log(req.files);
    
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
    
    

    // Stage 2: Reranking using bipartite matching (top N)
    const topNResults = await fetchBipartiteMatchResults([queryVectorA, queryVectorB], candidateArchetypeIds, topN);
    // console.log("topNResults ==> ", topNResults, candidates[0])

    // Get payload for top N candidate ids from candidates array and score from topNResults
    const results = topNResults.map(({ archetypeId, score }) => {
      const { payload } = candidates.find(c => String(c.payload?.archetypeId) === String(archetypeId));
      return { payload, score };
    });
    
    // Format results as needed for response and send back
    return res.status(200).json({
      error: false,
      data: {
        imageUrls: [],
        matchesFoundCount: topNResults.length,
        matches: results.map(formatResults)
      }
    });
  } catch (error) {
    console.error('==> Error in match controller:', error);
    return res.status(500).json({ error: true, reason: 'Internal server error' });
  }
}

// Controller placeholder for /match
// The handler accepts files from req.files (array of uploaded files via multer)
import { generateEmbeddings } from '../lib/embeddingService.js';
import { annSearch } from '../lib/search/ann.js';
import { addBpScores } from '../lib/search/bipartite.js';
import { formatResults } from '../lib/resultUtils.js';

// Final composite scoring function
function finalScore(c) {
  return (
    0.7  * c.ann_score -
    0.3  * Math.log(c.ann_rank + 1) +
    0.3  * c.bp_best +
    0.15 * c.bp_gap
  );
}


export async function match(req, res, next) {

  try {
    // Basic validation of uploaded files before processing
    if (!req.files || !Array.isArray(req.files) || req.files.length < 2) {
      return res.status(400).json({
        error: true,
        reason: 'Two input files are required for matching'
      });
    }

    const ANN_RECALL_SIZE = Number(process.env.ANN_RECALL_SIZE ?? 300);
    const TOP_N = Number(process.env.TOP_N ?? 5);
    
    // Stage 0: Preprocessing (e.g., feature extraction)
    const qVecs = await generateEmbeddings(req.files);

    const annResults = await annSearch(qVecs);
    const recallResults = annResults.slice(0, ANN_RECALL_SIZE);

    // Stage 2: Add Bipartite scores
    const recallResultsWithBp = await addBpScores(recallResults, qVecs);

    // Stage 3: Final rerank
    const ranked = recallResultsWithBp
      .map(c => ({ ...c, _finalScore: finalScore(c) }))
      .sort((a, b) => b._finalScore - a._finalScore)
      .slice(0, TOP_N);

    return res.json({
      error: false,
      data: {
        imageUrls: [],
        matchesFoundCount: ranked.length,
        matches: ranked.map(formatResults),
      },
    });

  } catch (error) {
    console.error('==> Error in match controller:', error);
    return res.status(500).json({ error: true, reason: 'Internal server error' });
  }
}

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
    0.7  * c.bp_best +
    0.15 * c.bp_gap
  );
}

function computePercentile(score, universe) {
  const mean = arr => arr.reduce((a, b) => a + b, 0) / arr.length;

  const std = (arr, mu) =>
    Math.sqrt(arr.reduce((s, x) => s + (x - mu) ** 2, 0) / arr.length);

  // Normal CDF (Abramowitz & Stegun)
  function normalCDF(z) {
    const t = 1 / (1 + 0.2316419 * Math.abs(z));
    const d = 0.3989423 * Math.exp(-z * z / 2);
    let p = d * t * (
      0.3193815 +
      t * (-0.3565638 +
      t * (1.781478 +
      t * (-1.821256 +
      t * 1.330274)))
    );
    if (z > 0) p = 1 - p;
    return p;
  }

  const mu = mean(universe);
  const sigma = std(universe, mu);

  if (sigma === 0) return 50; // all values identical

  const z = (score - mu) / sigma;
  const percentile = normalCDF(z) * 100;

  // Clamp for UI safety
  return Math.max(0, Math.min(100, percentile));
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

    // Stage 1: Initial ANN search for recall
    const annResults = await annSearch(qVecs);
    const recallResults = annResults.slice(0, ANN_RECALL_SIZE);
    
    // Stage 2: Add Bipartite scores
    const recallResultsWithBp = await addBpScores(recallResults, qVecs);

    // Stage 3: Final rerank
    let ranked = recallResultsWithBp
      .map(c => ({ ...c, _finalScore: finalScore(c) }))
      .sort((a, b) => b._finalScore - a._finalScore)
      .slice(0, TOP_N);

    // Compute & add percentile scores (aprox for UI)
    ranked = ranked.map(c => ({
      ...c,
      _percentileScore: computePercentile(c._finalScore, ranked.map(c => c._finalScore))
    }));
    
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

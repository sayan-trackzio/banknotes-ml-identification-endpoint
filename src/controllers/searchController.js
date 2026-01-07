// Controller placeholder for /match
// The handler accepts files from req.files (array of uploaded files via multer)
import { generateEmbeddings } from '../lib/embeddingService.js';
import { annSearch } from '../lib/annService.js';
import { addBpScores } from '../lib/bipartiteService.js';
import { formatResults } from '../lib/resultUtils.js';

import { init as cuidInit } from '@paralleldrive/cuid2';
const cuidGen = (n = 11) => cuidInit({ length: n })();


/**
 * Calculates a heuristic score for a candidate object based on multiple weighted signals.
*
* @param {Object} c - The candidate object to score.
 * @param {number} c.ann_score - The primary signal score (e.g., from an ANN search).
 * @param {number} c.ann_rank - The rank of the candidate in the ANN results (lower is better).
 * @param {number} c.bp_best - A business-specific signal representing the best score.
 * @param {number} c.bp_gap - A business-specific signal representing the score gap.
 * @returns {number} The computed heuristic score for the candidate.
 */
function heuristicScorer(c) {
  const rankBonus = 1 / (1 + c.ann_rank);

  return (
    0.8 * c.ann_score +   // primary signal
    0.3 * rankBonus +     // bounded, stable
    0.6 * c.bp_best +     // business signal
    0.15 * c.bp_gap
  );
}


/**
 * Computes the percentile rank of a given score within a universe of values,
 * assuming a normal distribution. Uses the normal cumulative distribution function (CDF)
 * to estimate the percentile.
 * NOTE: These are aproximations for UI purposes and not exact percentiles.
 *
 * @param {number} score - The score for which to compute the percentile.
 * @param {number[]} universe - An array of numbers representing the universe of scores.
 * @returns {number} The percentile rank of the score (0 to 100).
 */
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


/* Controller / Handler for `/match` endpoint */
export async function match(req, res, next) {

  try {
    // Basic validation of uploaded files before processing
    if (!req.files || !Array.isArray(req.files) || req.files.length < 2) {
      return res.status(400).json({
        error: true,
        reason: 'Two input files are required for matching'
      });
    }
    // Additional validation: mimetype and file size
    const ALLOWED_MIMETYPES = ['image/jpeg', 'image/png', 'image/webp'];
    const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

    for (const file of req.files) {
      if (!ALLOWED_MIMETYPES.includes(file.mimetype)) {
        return res.status(400).json({
          error: true,
          reason: `Invalid file type: ${file.originalname} (${file.mimetype}). Allowed types: ${ALLOWED_MIMETYPES.join(', ')}`
        });
      }
      if (file.size > MAX_FILE_SIZE) {
        return res.status(400).json({
          error: true,
          reason: `File too large: ${file.originalname} (${(file.size / 1024 / 1024).toFixed(2)} MB). Max allowed size is 5MB`
        });
      }
    }

    // Generate and add a image permalink (s3 url) to each uploaded file
    const AWS_S3_BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME ?? 'example-bucket';
    const AWS_REGION = process.env.AWS_REGION ?? 'us-west-2';
    for (const f of req.files) {
      const key = cuidGen();
      f.s3Key = key;
      f.permalink = `https://${AWS_S3_BUCKET_NAME}.s3.${AWS_REGION}.amazonaws.com/${key}`; // NOTE: actual upload happens in background later
    }

    /* *********** Core identification logic *********** */

    const ANN_RECALL_SIZE = Number(process.env.ANN_RECALL_SIZE ?? 300);
    const TOP_N = Number(process.env.TOP_N ?? 5);
    
    // Stage 0: Preprocessing (e.g., feature extraction)
    const qVecs = await generateEmbeddings(req.files);

    // Stage 1: Initial ANN search for recall
    const annResults = await annSearch(qVecs);
    const recallResults = annResults.slice(0, ANN_RECALL_SIZE); // soft trim for BP stage
    
    // Stage 2: Add Bipartite scores
    const recallResultsWithBp = await addBpScores(recallResults, qVecs);

    // Stage 3: Final rerank
    let ranked = recallResultsWithBp
      .map(c => ({ ...c, _finalScore: heuristicScorer(c) }))
      .sort((a, b) => b._finalScore - a._finalScore)

    // Optional logging to GCS sink
    if (process.env.LOG_QUERY_METRICS === 'true' && req.query.gtid) {
      try {
        const { logQuery } = await import('../lib/queryLogs.js');

        const query_id = cuidGen();        
        await logQuery({
          query_id,
          gt_id: req.query.gtid, // gt --> ground truth (expected correct archteypeId for match)
          is_image_normalized: !Boolean(req.query.gtaug),
          candidates: ranked
        });
        if (process.env.LOG_QUERY_AND_EXIT === 'true') {
          return res.status(200).json({ error: false, queryId: query_id }); // early return for training logs
        }
      } catch (queryLogError) {
        console.warn('==> Query logging Failed:', queryLogError);
        if (process.env.LOG_QUERY_AND_EXIT === 'true') {
          return res.status(500).json({ error: true, reason: error.message }); // early return for training logs
        }
      }
    }
    
    // Compute & add percentile scores (aprox for UI)
    ranked = ranked.map(c => ({
      ...c,
      _percentileScore: computePercentile(c._finalScore, ranked.map(c => c._finalScore))
    }));

    // Actually upload user images to S3 in the background (non-blocking)
    if (process.env.S3_UPLOAD_ENABLED === 'true') {
      import('../lib/s3Utils.js').then(({ uploadToS3InBackground }) => {
        uploadToS3InBackground(req.files).catch(s3ulError => {
          console.warn('==> Background S3 upload failed:', s3ulError.message);
        });
      });      
    }
    
    // Send final response back to client
    return res.json({
      error: false,
      data: {
        imageUrls: req.files.map(f => f.permalink),
        matchesFoundCount: ranked.length,
        matches: ranked
          .slice(0, TOP_N) // soft trim for final response
          .map(formatResults),
      },
    });
  } catch (error) {
    console.error('==> Error in search controller:', error);
    return res.status(500).json({ error: true, reason: 'Internal server error' });
  }
}

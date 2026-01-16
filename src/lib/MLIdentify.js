import { generateEmbeddings } from './imageEmbeddingService.js';
import { annSearch } from './annService.js';
import { addBpScores } from './bipartiteService.js';
import { formatResults } from './resultUtils.js';
import { heuristicScorer, computePercentile } from './utils.js';


/**
 * Core identification logic extracted from controller
 * @param {Array} images - Array of image file objects (same as req.files)
 * @returns {Promise<{
 *   ranked: Array,
 *   heuristicHead: Array,
 *   imageUrls: Array,
 *   matchesFoundCount: number,
 *   matches: Array
 * }>} Identification result
 */
export async function identify(images, nn = null) {
  if (process.env.LOG_TIMERS === 'true') console.time("==> Time taken by ML Identification workflow")
  // Generate and add a image permalink (s3 url) to each uploaded file
  const AWS_S3_BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME ?? 'example-bucket';
  const AWS_REGION = process.env.AWS_REGION ?? 'us-west-2';
  for (const f of images) {
    // Use cuid2 for key generation
    const { init: cuidInit } = await import('@paralleldrive/cuid2');
    const cuidGen = (n = 11) => cuidInit({ length: n })();
    const key = cuidGen();
    f.s3Key = key;
    f.permalink = `https://${AWS_S3_BUCKET_NAME}.s3.${AWS_REGION}.amazonaws.com/${key}`;
  }

  const ANN_RECALL_SIZE = Number(process.env.ANN_RECALL_SIZE ?? 300);
  const TOP_N = Number(process.env.TOP_N ?? 5);

  // Stage 0: Preprocessing (e.g., feature extraction)
  if (process.env.LOG_TIMERS === 'true') console.time('Stage 0: Embedding Generation');
  const qVecs = await generateEmbeddings(images);
  if (process.env.LOG_TIMERS === 'true') console.timeEnd('Stage 0: Embedding Generation');

  // Stage 1: Initial ANN search for recall
  if (process.env.LOG_TIMERS === 'true') console.time('Stage 1: ANN Search');
  const recallResults = await annSearch(qVecs); // Full ANN results (Max size: 2 X ANN_RECALL_SIZE)
  // const recallResults = annResults.slice(0, ANN_RECALL_SIZE); // Soft Trim to recall size
  if (process.env.LOG_TIMERS === 'true') console.timeEnd('Stage 1: ANN Search');

  // Stage 2: Add Bipartite scores
  if (process.env.LOG_TIMERS === 'true') console.time('Stage 2: Bipartite Scoring');
  const recallResultsWithBp = await addBpScores(recallResults, qVecs); // Compute and add BP scores to each candidate
  if (process.env.LOG_TIMERS === 'true') console.timeEnd('Stage 2: Bipartite Scoring');
  
  // Stage 3: Heuristics based rerank
  if (process.env.LOG_TIMERS === 'true') console.time('Stage 3: Heuristics based Reranking');
  let ranked = recallResultsWithBp
    .map(c => ({ ...c, _finalScore: heuristicScorer(c) }))
    .sort((a, b) => b._finalScore - a._finalScore);
    if (process.env.LOG_TIMERS === 'true') console.timeEnd('Stage 3: Heuristics based Reranking');

  // Stage 4: Compute & add percentile scores (aprox - for UI)
  if (process.env.LOG_TIMERS === 'true') console.time('Stage 4: Match Percentage Computation for UI');
  ranked = ranked.map(c => ({
    ...c,
    _percentileScore: computePercentile(c._finalScore, ranked.map(c => c._finalScore))
  }));
  if (process.env.LOG_TIMERS === 'true') console.timeEnd('Stage 4: Match Percentage Computation for UI');

  let head = ranked.slice(0, TOP_N); // Top results based on heuristic ranking, soft trimmed to TOP_N

  // ML-based optimization (optional)
  if (process.env.APPLY_XGBOOST_OPTIMIZATION === 'true' && process.env.XGBOOST_SCORE_API_URL?.startsWith('http')) {
    if (process.env.LOG_TIMERS === 'true') console.time('Stage 5: ML-based Optimization');
    const { optimizeHead } = await import('./xgboostScorer.js');
    // Using a ML model, refine the top N results further
    head = await optimizeHead({
      candidates: ranked,
      topN: TOP_N,
      extraCandidatesSize: process.env.XGBOOST_EXTRA_CANDIDATES_SIZE ? Number(process.env.XGBOOST_EXTRA_CANDIDATES_SIZE) : 5
    }); // Note: head.length will still be TOP_N
    if (process.env.LOG_TIMERS === 'true') console.time('Stage 5: ML-based Optimization');
  }

  if (process.env.LOG_TIMERS === 'true') console.timeEnd("==> Time taken by ML Identification workflow")
  
  // Compute ranks for a specific Numista Item Number if provided (DEBUG)
  let ranks
  if (nn) {
    const annNumistaNumbers = recallResults.map(r => r.payload?.archetypeDetails?.numistaItemNumber);
    const finalNumistaNumbers = ranked.map(r => r.payload?.archetypeDetails?.numistaItemNumber);
    ranks = {
      ann: annNumistaNumbers.findIndex(n => String(n) === String(`N# ${nn}`)) + 1,
      heuristic: ranked.findIndex(n => String(n.payload?.archetypeDetails?.numistaItemNumber) === String(`N# ${nn}`)) + 1
    }
    console.info(`>>>>>>>>>>>> Numista Item Number N# ${nn} Ranks => ANN: ${ranks.ann}, Heuristic: ${ranks.heuristic} <<<<<<<<<<<<<`);
  }

  return {
    ranked, // all ANN recall results ranked by heuristic scores
    head,  // final top N results after optional ML optimization
    imageUrls: images.map(f => f.permalink),
    matchesFoundCount: head.length,
    matches: head.map(formatResults),
    ranks: nn ? ranks : undefined
  };
}
/**
 * Sends a batch of feature vectors to the scoring API and retrieves their scores.
 *
 * @async
 * @function batchFetchScores
 * @param {Array<Array<number>>} featureMatrix - An array of feature vectors, each representing a candidate.
 * @returns {Promise<Array<number>>} - A promise that resolves to an array of scores corresponding to the input feature vectors.
 * @throws {Error} If the API response is not OK, throws an error with the response status and message.
 */

/**
 * Optimizes the head of the candidate list by potentially replacing the last candidate in the top N with a better-scoring candidate from the next few candidates, using an external XGBoost scoring API.
 *
 * @async
 * @function optimizeHead
 * @param {Object} params - The parameters object.
 * @param {Array<Object>} params.candidates - The list of candidate objects to consider.
 * @param {number} params.topN - The number of top candidates to keep.
 * @param {number} [params.extraCandidatesSize=5] - The number of extra candidates to consider for replacement.
 * @returns {Promise<Array<Object>>} - A promise that resolves to the optimized list of top N candidates.
 */
async function batchFetchScores(featureMatrix) {
  const url = process.env.XGBOOST_SCORE_API_URL ?? 'http://localhost:5000/score';
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(featureMatrix),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Score API error: ${res.status} ${text}`);
  }

  return await res.json();
}


/**
 * Optimizes the head of a list of candidate objects by re-ranking the last element
 * of the heuristically selected topN candidates using XGBoost scores.
 *
 * @async
 * @function optimizeHead
 * @param {Object} params - The parameters object.
 * @param {Array<Object>} params.candidates - The list of candidate objects to be ranked.
 * @param {number} params.topN - The number of top candidates to select.
 * @param {number} [params.extraCandidatesSize=5] - The number of extra candidates to consider for re-ranking.
 * @returns {Promise<Array<Object>>} A promise that resolves to the optimized list of topN candidates.
 */
export async function optimizeHead({ candidates, topN, extraCandidatesSize = 5 }) {
  let heuristicsHead = candidates.slice(0, topN);
  let candidatesToCheck = candidates.slice(topN - 1, topN + extraCandidatesSize);

  const featureMatrix = candidatesToCheck.map(c => [
    c.ann_score,
    c.bp_best,
    c.bp_gap
  ]);
  const scores = await batchFetchScores(featureMatrix);

  candidatesToCheck = candidatesToCheck
    .map((c, idx) => ({
      ...c,
      _xgbScore: scores[idx]
    }))
    .sort((a, b) => b._xgbScore - a._xgbScore);

  const prospect = candidatesToCheck[0];
  delete prospect._xgbScore;

  if (String(prospect.item_id) !== String(heuristicsHead[topN - 1].item_id)) {
    console.info(`==> XgBoost Head Optimization: Replacing candidate id ${heuristicsHead[topN - 1].item_id} with id ${prospect.item_id}`);
    heuristicsHead = [...heuristicsHead.slice(0, -1), prospect ];
  } else {
    console.info('==> XgBoost Head Optimization: No better candidate found for replacement.');
  }
  return heuristicsHead.slice(0, topN); // always ensure topN size
}
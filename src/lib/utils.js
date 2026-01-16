/**
 * Calculates a heuristic score for a candidate object based on multiple weighted features.
 *
 * @param {Object} c - The candidate object to score.
 * @param {number} c.ann_score - The ANN (Approximate Nearest Neighbor) score.
 * @param {number} c.ann_rank - The rank of the candidate in the ANN results (lower is better).
 * @param {number} c.bp_best - The best score from the BP (possibly "best prediction" or similar) metric.
 * @param {number} c.bp_gap - The gap score from the BP metric.
 * // @param {number} [c.text_score] - (Optional) The text score, if available.
 * @returns {number} The computed heuristic score for the candidate.
 */
function heuristicScorer(c) {
  const rankBonus = 1 / (1 + c.ann_rank);
  return (
    0.8 * c.ann_score +
    0.3 * rankBonus +
    0.6 * c.bp_best +
    0.15 * c.bp_gap
    // + 0.5 * (c.text_score ?? 0) // if text_score is available
    // - ((c.text_score && c.text_score < 0.5) ? 0.15 : 0) // small penalty for low text score, if available at all
  );
}


/**
 * Computes an aprox percentile score within a universe of values,
 * for the UI.
 *
 * @param {number} score - The score to compute the percentile for.
 * @param {number[]} universe - The array of numbers representing the universe of scores.
 * @returns {number} The percentile rank of the score (0 to 100).
 */
function computePercentile(score, universe) {
  const mean = arr => arr.reduce((a, b) => a + b, 0) / arr.length;
  const std = (arr, mu) =>
    Math.sqrt(arr.reduce((s, x) => s + (x - mu) ** 2, 0) / arr.length);
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
  if (sigma === 0) return 50;
  const z = (score - mu) / sigma;
  const percentile = normalCDF(z) * 100;
  return Math.max(0, Math.min(100, percentile));
}

/**
 * Calculates the cosine similarity between two vectors.
 * (L2-normalized vectors are assumed for accurate results.)
 *
 * @param {number[]} a - The first vector.
 * @param {number[]} b - The second vector.
 * @returns {number} The dot product of the two vectors.
 */
function cosine(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

export { heuristicScorer, computePercentile, cosine };

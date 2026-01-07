export async function logQuery({ query_id, gt_id, is_image_normalized, candidates }) {
  // console.log("query_id ==> ", query_id)
  const sortedByAnnScore = [...candidates]
  const sortedByFinalScore = [...candidates].sort((a, b) => b._finalScore - a._finalScore);

  const timestampMs = Date.now();

  const logRows = sortedByAnnScore.map((c, idx) => ({
    log_tag: process.env.LOG_TAG ?? 'query_metric', // filter for gcs storage sink
    ts: timestampMs,

    query_id,
    gt_id,
    is_image_normalized,
    candidate_id: c.item_id,
    final_score: c._finalScore,
    final_rank: sortedByFinalScore.findIndex(sc => sc.item_id === c.item_id) + 1,
    numista_id: c.payload?.archetypeDetails?.archetypeDetails?.numistaItemNumber,

    // Params which may be used to train a reranker model
    ann_rank: c.ann_rank,
    ann_score: c.ann_score,
    bp_best: c.bp_best,
    bp_gap: c.bp_gap,

    label: c.item_id === gt_id ? 1 : 0 // tells us if this candidate is the ground truth match
  }))
  // Print log rows as JSON lines, so that they get captured by stdout logging and subsequently picked up by GCS sink:
  console.log(JSON.stringify(logRows));
}
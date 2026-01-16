const { init: cuidInit } = await import('@paralleldrive/cuid2');
const cuidGen = (n = 11) => cuidInit({ length: n })();
// Controller placeholder for /match
// The handler accepts files from req.files (array of uploaded files via multer)
import { validateImagesByLLM } from '../lib/llmGating.js';
import { generateEmbeddings } from '../lib/imageEmbeddingService.js';
import { annSearch } from '../lib/annService.js';
import { addBpScores } from '../lib/bipartiteService.js';
import { formatResults } from '../lib/resultUtils.js';
import { heuristicScorer, computePercentile } from '../lib/utils.js';

/* Controller / Handler for the `/search` endpoint */
export async function post(req, res, next) {
  const nn = req.query.nn || null;
  const TOP_N = Number(process.env.TOP_N ?? 5);
  try {
    // Basic validation of uploaded files before processing
    if (!req.files || !Array.isArray(req.files) || req.files.length < 2) {
      return res.status(400).json({
        error: true,
        reason: 'Two input files are required for matching'
      });
    }

    const uploadedImages = req.files;
  
    // Additional validation: mimetype and file size
    const ALLOWED_MIMETYPES = ['image/jpeg', 'image/png', 'image/webp'];
    const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
    for (const file of uploadedImages) {
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
    for (const file of uploadedImages) {
      // Use cuid2 for key generation
      const key = cuidGen();
      file.s3Key = key;
      file.permalink = `https://${AWS_S3_BUCKET_NAME}.s3.${AWS_REGION}.amazonaws.com/${key}`;
    }

    /* Core business logic starts here */
    const useLLMGating = process.env.LLM_GATE_ENABLED === 'true';
    const logTimers = process.env.LOG_TIMERS === 'true';

    const [llmResult, [recallResults, recallResultsWithBipScores]] = await Promise.all([
      useLLMGating ? validateImagesByLLM(uploadedImages) : Promise.resolve({ error: false, name: null }), // Temporarily disable LLM gating
      (async () => {
        const qVecs = await generateEmbeddings(uploadedImages);
        const annResults = await annSearch(qVecs);
        const withBipScores = await addBpScores(annResults, qVecs);
        return [annResults, withBipScores];
      })()
    ]);

    // Check for LLM gating errors
    if (llmResult.error) { // Exit immediately, discarding the ML results
      return res.status(400).json({
        error: true,
        aiErrorCode: llmResult.errorCode,
        reason: llmResult.reason
      });
    }

    // If applicable, compute and add text scores to each candidate
    let recallResultsWithBipAndTextScores = recallResultsWithBipScores;
    if (useLLMGating && llmResult.name) {
      // const nameLower = llmResult.name.toLowerCase();
      // recallResultsWithBipAndTextScores = await addTextScores(recallResultsWithBipScores, nameLower);
    }

    // Heuristics based rerank
    let ranked = recallResultsWithBipAndTextScores // may or may not have text scores added
      .map(c => ({ ...c, _finalScore: heuristicScorer(c) }))
      .sort((a, b) => b._finalScore - a._finalScore);

    // Compute & add percentile scores (aprox - for UI)
    ranked = ranked.map(c => ({
      ...c,
      _percentileScore: computePercentile(c._finalScore, ranked.map(c => c._finalScore))
    }));


    // Optional logging to GCS sink
    if (process.env.LOG_QUERY_METRICS === 'true' && req.query.gtid) {
      try {
        const { logQuery } = await import('../lib/queryLogs.js');
        const { init: cuidInit } = await import('@paralleldrive/cuid2');
        const cuidGen = (n = 11) => cuidInit({ length: n })();
        const query_id = cuidGen();
        await logQuery({
          query_id,
          gt_id: req.query.gtid,
          is_image_normalized: !Boolean(req.query.gtaug),
          candidates: mlIdentificationResults.ranked
        });
        if (process.env.LOG_QUERY_AND_EXIT === 'true') {
          return res.status(200).json({ error: false, queryId: query_id });
        }
      } catch (queryLogError) {
        console.warn('==> Query logging Failed:', queryLogError);
        if (process.env.LOG_QUERY_AND_EXIT === 'true') {
          return res.status(500).json({ error: true, reason: queryLogError.message });
        }
      }
    }

    // Actually upload user images to S3 in the background (non-blocking)
    if (process.env.S3_UPLOAD_ENABLED === 'true') {
      import('../lib/s3Utils.js').then(({ uploadToS3InBackground }) => {
        uploadToS3InBackground(uploadedImages).catch(s3ulError => {
          console.warn('==> Background S3 upload failed:', s3ulError.message);
        });
      });
    }

    // Compute ranks for a specific Numista Item Number if provided (DEBUG)
    let ranks = undefined;
    if (nn) {
      const annNumistaNumbers = recallResults.map(r => r.payload?.archetypeDetails?.numistaItemNumber);
      const finalNumistaNumbers = ranked.map(r => r.payload?.archetypeDetails?.numistaItemNumber);
      ranks = {
        ann: annNumistaNumbers.findIndex(n => String(n) === String(`N# ${nn}`)) + 1,
        heuristic: ranked.findIndex(n => String(n.payload?.archetypeDetails?.numistaItemNumber) === String(`N# ${nn}`)) + 1
      }
      console.info(`>>>>>>>>>>>> Numista Item Number N# ${nn} Ranks => ANN: ${ranks.ann}, Heuristic: ${ranks.heuristic} <<<<<<<<<<<<<`);
    }

    // Send final response back to client
    const matches = ranked.slice(0, TOP_N).map(formatResults);
    return res.json({
      error: false,
      ranks,
      data: {
        imageUrls: uploadedImages.map(f => f.permalink),
        matchesFoundCount: matches.length,
        matches,
      },
    });
  } catch (error) {
    console.error('==> Error in search controller:', error);
    return res.status(500).json({ error: true, reason: 'Internal server error' });
  }
}

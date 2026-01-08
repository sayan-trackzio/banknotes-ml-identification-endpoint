// Controller placeholder for /match
// The handler accepts files from req.files (array of uploaded files via multer)
import { validateImagesByLLM } from '../lib/llmGating.js';
import { identify } from '../lib/MLIdentify.js';


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

    // Call core identification logic and LLM gating logic
    const [llmGatingResult, mlIdentificationResults] = await Promise.all([
      validateImagesByLLM(req.files),
      identify(req.files)
    ]);
    // Check for LLM gating errors
    if (llmGatingResult.error) { // Exit immediately, discarding the ML identification results
      return res.status(400).json({
        error: true,
        aiErrorCode: llmGatingResult.errorCode,
        reason: llmGatingResult.reason
      });
    }

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
        uploadToS3InBackground(req.files).catch(s3ulError => {
          console.warn('==> Background S3 upload failed:', s3ulError.message);
        });
      });
    }

    // Send final response back to client
    return res.json({
      error: false,
      data: {
        imageUrls: mlIdentificationResults.imageUrls,
        matchesFoundCount: mlIdentificationResults.matchesFoundCount,
        matches: mlIdentificationResults.matches,
      },
    });
  } catch (error) {
    console.error('==> Error in search controller:', error);
    return res.status(500).json({ error: true, reason: 'Internal server error' });
  }
}

// Minimal embedding service — simplified for production
// - Assumes inputs are image files (multer file objects with `buffer`)
// - Uses batch feature extraction with pooling and normalization
// - Caches models to avoid re-downloads

import { pipeline } from '@huggingface/transformers';

// Optional (recommended for prod): avoids re-downloading models
// process.env.TRANSFORMERS_CACHE = './models';

let extractor = null;
async function initExtractor() {
  if (extractor) return extractor;
  const modelName = process.env.EMBED_MODEL || 'Xenova/dinov2-small';
  extractor = await pipeline('image-feature-extraction', modelName);
  return extractor;
}

export async function generateEmbeddings(files) {
  const inputs = Array.isArray(files) ? files : Array.from(arguments);
  const pipe = await initExtractor();

  // Batch feature extraction
  const embeddings = await pipe(inputs.map(f => f.buffer), {
    pooling: 'mean',   // global image embedding
    normalize: true,   // cosine-sim ready
  });

  return embeddings;
}


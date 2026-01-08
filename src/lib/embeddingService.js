// Minimal embedding service — simplified for production
// - Assumes inputs are image files (multer file objects with `buffer`)
// - Uses batch feature extraction with pooling and normalization
// - Caches models to avoid re-downloads

import { pipeline, RawImage } from '@huggingface/transformers';

// Optional (recommended for prod): avoids re-downloading models
// process.env.TRANSFORMERS_CACHE = './hf_cache';

let extractor = null;
async function initExtractor() {
  if (extractor) return extractor;
  const modelName = process.env.EMBED_MODEL || 'Xenova/dinov2-small';
  extractor = await pipeline('image-feature-extraction', modelName);
  return extractor;
}

export async function generateEmbeddings(files) {
  try {
    const inputs = Array.isArray(files) ? files : Array.from(arguments);
    const pipe = await initExtractor();

    // Convert buffers to RawImage objects
    const images = await Promise.all(
      inputs.map(f => RawImage.fromBlob(new Blob([f.buffer])))
    );

    // Batch feature extraction without pooling
    const embeddings = await pipe(images, {
      pooling: 'mean',
      normalize: true,
    });

    // console.log('Embeddings tensor dims:', embeddings.dims);
    // console.log('Embeddings tensor type:', embeddings.type);
    
    // Handle different tensor shapes
    const dims = embeddings.dims;
    
    if (dims.length === 2) {
      // Already pooled: [batch_size, embedding_dim]
      const [batchSize, embeddingDim] = dims;
      const data = Array.from(embeddings.data);
      const vectors = [];
      for (let i = 0; i < batchSize; i++) {
        vectors.push(data.slice(i * embeddingDim, (i + 1) * embeddingDim));
      }
      return vectors;
    } else if (dims.length === 3) {
      // Not pooled: [batch_size, num_patches, embedding_dim]
      // Use CLS token (first token) for each batch
      const [batchSize, numPatches, embeddingDim] = dims;
      const data = Array.from(embeddings.data);
      const vectors = [];
      for (let i = 0; i < batchSize; i++) {
        // Extract CLS token (first token)
        const offset = i * numPatches * embeddingDim;
        vectors.push(data.slice(offset, offset + embeddingDim));
      }
      return vectors;
    } else {
      throw new Error(`Unexpected tensor shape: ${dims}`);
    }
  } catch (error) {
    console.error('==> Error in generateEmbeddings:', error);
    throw error;
  }
}


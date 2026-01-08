import * as os from 'os';
import path from 'path';
import { pipeline, env } from '@huggingface/transformers';

console.log('TRANSFORMERS resolved cache =', env.cacheDir);

const model = process.env.EMBED_MODEL || 'Xenova/dinov2-small';
await pipeline('image-feature-extraction', model);

console.log('DONE – model cached');

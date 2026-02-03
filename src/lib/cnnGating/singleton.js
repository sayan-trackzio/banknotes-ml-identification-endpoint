import ort from 'onnxruntime-node';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let sessionPromise = null;

function getSession() {
  if (!sessionPromise) {
    sessionPromise = ort.InferenceSession.create(path.join(__dirname, 'banknote-classifier.model.onnx'), {
      executionProviders: ['cpu'],
      intraOpNumThreads: 4
    });
  }
  return sessionPromise;
}

export { ort, getSession };

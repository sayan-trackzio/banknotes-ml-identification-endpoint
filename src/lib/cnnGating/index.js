import sharp from 'sharp';
import { getSession, ort } from './singleton.js';

const IMG_SIZE = 224;
const CONFIDENCE_THRESHOLD = Number(process.env.CNN_CONFIDENCE_THRESHOLD ?? 0.8);
const HIGH_CONFIDENCE_THRESHOLD = 0.985;

// Normalization parameters used during training
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

async function preprocess(input) {
  const buf = await sharp(input)
    .resize(IMG_SIZE, IMG_SIZE)
    .removeAlpha()
    .raw()
    .toBuffer();

  const floatData = new Float32Array(3 * IMG_SIZE * IMG_SIZE);

  // HWC -> CHW + normalize
  for (let i = 0; i < IMG_SIZE * IMG_SIZE; i++) {
    const r = buf[i * 3] / 255;
    const g = buf[i * 3 + 1] / 255;
    const b = buf[i * 3 + 2] / 255;

    floatData[i] = (r - MEAN[0]) / STD[0];
    floatData[i + IMG_SIZE * IMG_SIZE] = (g - MEAN[1]) / STD[1];
    floatData[i + 2 * IMG_SIZE * IMG_SIZE] = (b - MEAN[2]) / STD[2];
  }

  return floatData;
}

async function computeConfidenceMatrix(paths) {
  if (!Array.isArray(paths)) paths = [paths];

  const session = await getSession();
  const confidenceMatrix = [];

  for (const imagePath of paths) {
    const inputTensor = await preprocess(imagePath);
    const tensor = new ort.Tensor('float32', inputTensor, [1, 3, IMG_SIZE, IMG_SIZE]);
    
    const outputs = await session.run({ input: tensor });
    const logits = outputs.output.data;

    const banknoteScore = logits[0];
    const notScore = logits[1];

    // Convert logits to probabilities using softmax
    const ea = Math.exp(banknoteScore);
    const eb = Math.exp(notScore);
    const sum = ea + eb;

    confidenceMatrix.push({
      banknote: ea / sum,
      not_banknote: eb / sum
    });
  }

  return confidenceMatrix;
}

/**
 * Determines whether a set of image paths should be considered banknotes based on model confidences.
 *
 * Calls computeConfidenceMatrix(paths) to get confidence scores per image, augments each entry with
 * an `isBanknote` flag (true when banknote confidence is greater than not_banknote and exceeds
 * CONFIDENCE_THRESHOLD), and applies the following gate logic:
 *   - Returns true if all entries are classified as banknotes.
 *   - If exactly one entry is classified as a banknote, returns true only if that entry's banknote
 *     confidence is at least HIGH_CONFIDENCE_THRESHOLD.
 *   - Otherwise returns false.
 *
 * @async
 * @param {string[]} paths - Array of image file paths to evaluate.
 * @returns {Promise<boolean>} Resolves to true when the gate considers the inputs banknotes, otherwise false.
 * @throws {Error} If computeConfidenceMatrix(paths) fails or returns an unexpected structure.
 * @remarks Expects computeConfidenceMatrix to return an array of objects with numeric
 *          `banknote` and `not_banknote` properties. Relies on external constants
 *          CONFIDENCE_THRESHOLD and HIGH_CONFIDENCE_THRESHOLD.
 */
export async function cnnGate(paths) {
  if (process.env.LOG_TIMERS === 'true') console.time('==> Time taken by CNN Gate');
  try {
    let matrix = await computeConfidenceMatrix(paths);
    matrix = matrix.map(el => ({
      ...el,
      isBanknote: (el.banknote > el.not_banknote) && el.banknote > CONFIDENCE_THRESHOLD
    }));
    
    console.debug('Confidence Matrix ==> ', matrix)

    // Check if all are banknotes
    const allBanknotes = matrix.every(el => el.isBanknote);
    
    if (allBanknotes) {
      return true;
    }

    // Special case to PASS: one is not a banknote, but the other is, and has very high confidence of that
    const banknoteCount = matrix.filter(el => el.isBanknote).length;
    if (banknoteCount === 1) {
      const highConfidenceBanknote = matrix.some(el => 
        el.isBanknote && el.banknote >= HIGH_CONFIDENCE_THRESHOLD
      );
      if (highConfidenceBanknote) {
        return true;
      }
    }

    return false;
  } catch (error) {
    console.error('==> CNN Gate error:', error);
    throw error;
  } finally {
    if (process.env.LOG_TIMERS === 'true') console.timeEnd('==> Time taken by CNN Gate');
  }
}

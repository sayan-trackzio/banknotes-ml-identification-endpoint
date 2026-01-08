import geminiModel from './vertexGemini.js';

// Custom prompt for banknote/coin validation
const VALIDATION_PROMPT = `
You are an expert numismatist and visual analyst.

Given two images for the two faces/sides of a banknote, analyze and determine if they depict a valid banknote.

If you cannot confirm both images are of a valid banknote (e.g., not banknotes, too blurry, both images are the same or clearly different banknotes, or any other issue), respond with:
{
  "error": true,
  "errorCode": "E001 | E002 | E003 | E005 | E006", // E001: Not a banknote; E002: Image too blurry/distorted; E005: Images are both of the same side of a banknote; E006: Images represent two clearly & surely different banknotes; E003: Other generic error
  "reason": "Concise, specific reason"
}

If valid, respond with:
{
  "error": false
}

Output only valid JSON, no extra text.
`;

// Strict response schema for Gemini JSON output
const responseSchema = {
  type: 'object',
  properties: {
    error: { type: 'boolean' },
    errorCode: { type: 'string' },
    reason: { type: 'string' },
  },
  required: ['error'],
  additionalProperties: false,
};
/**
 * Uses Gemini LLM to validate uploaded images as banknotes/coins.
 * @param {Array} images - Array of image file objects (with buffer or path)
 * @returns {Promise<Object>} LLM response (parsed JSON or error)
 */
export async function validateImagesByLLM(images) {
  if (process.env.LOG_TIMERS === 'true') console.time("==> Time taken by LLM Gating workflow")
  if (!Array.isArray(images) || images.length < 2) {
    return {
      error: true,
      errorCode: 'E003',
      reason: 'At least two images are required for validation.'
    };
  }

  // Prepare Gemini API request
  const contents = [
    {
      role: 'user',
      parts: [
        { text: VALIDATION_PROMPT },
        ...images.slice(0, 2).map(img => ({
          inlineData: {
            mimeType: img.mimetype || 'image/jpeg',
            data: img.buffer ? img.buffer.toString('base64') : ''
          }
        }))
      ]
    }
  ];

  const generationConfig = {
    responseMimeType: 'application/json',
    responseSchema,
  };

  try {
    const result = await geminiModel.generateContent({ contents, generationConfig });
    const response = result.response;
    // The response is a string that must be parsed
    const text = response.candidates?.[0]?.content?.parts?.[0]?.text;
    // console.log("text ==> ", text)
    if (typeof text === 'string') {
      try {
        return JSON.parse(text);
      } catch (parseErr) {
        return {
          error: true,
          errorCode: 'E003',
          reason: 'Failed to parse LLM response as JSON.'
        };
      }
    } else {
      return {
        error: true,
        errorCode: 'E003',
        reason: 'LLM response is not a string.'
      };
    }
  } catch (err) {
    return {
      error: true,
      errorCode: 'E003',
      reason: 'LLM API call failed: ' + err.message
    };
  } finally {
    if (process.env.LOG_TIMERS === 'true') console.timeEnd("==> Time taken by LLM Gating workflow")
  }
}

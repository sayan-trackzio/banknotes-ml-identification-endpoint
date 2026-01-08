/**
 * Format a candidate into the API response shape.
 *
 * Placeholder behavior: returns the candidate as-is, ensuring `id` is string.
 */
export function formatResults(candidate) {
	const ARCHETYPE_IMAGES_BASE_URL = process.env.ARCHETYPE_IMAGES_BASE_URL ?? 'https://trackzio-archetype-images.s3.us-west-2.amazonaws.com/banknotes';
  const nn = candidate?.payload?.archetypeDetails?.numistaItemNumber.replace('N# ', '');

  return {
    ...candidate.payload?.archetypeDetails,
    _id: candidate.payload?.archetypeId,
    archetypeImageUrls: [
      `${ARCHETYPE_IMAGES_BASE_URL}/${nn}_A.jpg`,
      `${ARCHETYPE_IMAGES_BASE_URL}/${nn}_B.jpg`
    ],
    // imageUrls: undefined,
    similarityScore: `${candidate._percentileScore?.toFixed(2)}%` || 'N/A',
		_finalScore: candidate._finalScore,
  }
}

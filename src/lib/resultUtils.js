// Minimal result utilities stubs (ESM)
// These exist so the controller can run end-to-end while the real
// reranking/search + formatting logic is still under development.
//
// Expected candidate shape (recommended):
//   {
//     id: string,            // unique identifier (often same as archetypeId)
//     archetypeId: string,   // archetype identifier
//     score: number,         // similarity score (higher is better)
//     payload?: object       // optional metadata
//   }

/**
 * Merge multiple candidate lists into one list (UNION).
 *
 * Placeholder behavior:
 * - Concatenates candidates from multiple lists.
 * - De-dupes by `archetypeId` field by default.
 * - Keeps the entry with the higher `score`.
 * - Returns candidates sorted by `score` descending (missing score treated as 0).
 */
export function mergeCandidates(dedupKey = 'archetypeId', ...candidates) {
	const all = [].concat(...candidates.filter(Array.isArray))

	const byKey = new Map();

	for (const candidate of all) {
		if (!candidate || typeof candidate !== 'object') continue;

		// Get the dedup key value from candidate.payload
		const keyValue = candidate.payload?.[dedupKey];
		if (keyValue == null) continue;

		const existing = byKey.get(keyValue);
		const score = Number(candidate.score ?? 0);
		const existingScore = existing ? Number(existing.score ?? 0) : -Infinity;

		if (!existing || score > existingScore) {
			byKey.set(keyValue, candidate);
		}
	}

	return Array.from(byKey.values()).sort(
		(a, b) => Number(b.score ?? 0) - Number(a.score ?? 0)
	);
}

/**
 * Format a candidate into the API response shape.
 *
 * Placeholder behavior: returns the candidate as-is, ensuring `id` is string.
 */
export function formatResults(candidate) {

  const nn = candidate?.payload?.archetypeDetails?.archetypeDetails?.numistaItemNumber.replace('N# ', '');

  return {
    ...candidate.payload?.archetypeDetails?.archetypeDetails,
    _id: candidate.payload?.archetypeId,
    archetypeImageUrls: [
      `https://trackzio-archetype-images.s3.us-west-2.amazonaws.com/banknotes/${nn}_A.jpg`,
      `https://trackzio-archetype-images.s3.us-west-2.amazonaws.com/banknotes/${nn}_B.jpg`
    ],
    imageUrls: undefined,
    similarityScore: `${candidate._percentileScore?.toFixed(2)}% (${candidate._finalScore})` || 'N/A',
  }
}

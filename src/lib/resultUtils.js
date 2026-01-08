/**
 * Format a candidate into the API response shape.
 *
 * Placeholder behavior: returns the candidate as-is, ensuring `id` is string.
 */
export function formatResults(candidate) {
  const details = candidate.payload?.archetypeDetails || {};
  const ARCHETYPE_IMAGES_BASE_URL = process.env.ARCHETYPE_IMAGES_BASE_URL ?? 'https://trackzio-archetype-images.s3.us-west-2.amazonaws.com/banknotes';
  const nn = details.numistaItemNumber?.replace('N# ', '');
  const archetypeId = candidate.payload?.archetypeId;

  return {
    name: details.name,
    currency: details.currency,
    issuer: details.issuer,
    issuingBank: details.issuingBank,
    year: details.year,
    ruler: details.ruler,
    shape: details.shape,
    rarity: details.rarity,
    material: details.material,
    size: details.size,
    watermark: details.watermark,
    signature: details.signature,
    printer: details.printer,
    references: details.references,
    frontDesign: details.frontDesign,
    backDesign: details.backDesign,
    context: details.context,
    condition: details.condition,
    estimatedPrice: details.estimatedPrice,
    inCirculation: details.inCirculation,
    archetypeImageUrls: nn ? [
      `${ARCHETYPE_IMAGES_BASE_URL}/${nn}_A.jpg`,
      `${ARCHETYPE_IMAGES_BASE_URL}/${nn}_B.jpg`
    ] : [],
    _archetype: archetypeId,
    archetypeId,
    similarityScore: candidate.similarityScore || `${candidate._percentileScore?.toFixed(2)}%` || 'N/A',
    _finalScore: candidate._finalScore || null,
  };
}

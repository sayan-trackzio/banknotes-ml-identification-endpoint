import { QdrantClient } from '@qdrant/js-client-rest';

const {QDRANT_URL: qdrantUrl, QDRANT_API_KEY: apiKey } = process.env;
if (!qdrantUrl) {
  throw new Error('QDRANT_URL environment variable is not set. Please configure QDRANT_URL to initialize QdrantClient.');
}
if (!apiKey) {
  console.warn(
    'QDRANT_API_KEY environment variable is not set. Proceeding without authentication; this may cause authentication failures against secured Qdrant instances.'
  );
}

const qdrantConfig = { url: qdrantUrl, checkCompatibility: false };
if (apiKey) qdrantConfig.apiKey = apiKey;

const qdrant = new QdrantClient(qdrantConfig);
export default qdrant; // Export the Singlteon instance

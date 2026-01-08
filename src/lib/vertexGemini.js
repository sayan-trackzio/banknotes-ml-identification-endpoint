import { VertexAI } from "@google-cloud/vertexai";

// ====== Setup Service account JSON ======
if (!process.env.SERVICE_ACCOUNT_JSON_BASE64) {
  throw new Error("SERVICE_ACCOUNT_JSON_BASE64 environment variable is not set.");
}

let SERVICE_ACCOUNT_JSON;
try {
  SERVICE_ACCOUNT_JSON = JSON.parse(
    Buffer.from(process.env.SERVICE_ACCOUNT_JSON_BASE64, "base64").toString("utf8")
  );
} catch (err) {
  throw new Error("Failed to parse SERVICE_ACCOUNT_JSON_BASE64: " + err.message);
}


// ====== Initialize VertexAI with in-memory credentials ======
const vertexai = new VertexAI({
  project: SERVICE_ACCOUNT_JSON.project_id,
  location: "us-central1",
  googleAuthOptions: {
    credentials: SERVICE_ACCOUNT_JSON
  }
});

// ====== Load Gemini Model ======
const geminiModel = vertexai.getGenerativeModel({
  model: process.env.GEMINI_MODEL ?? 'gemini-2.0-flash-lite',
});

export default geminiModel; // Export the singleton instance

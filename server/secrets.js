/**
 * Server-only secret readers. Never import from Expo client screens.
 * Never read EXPO_PUBLIC_* for API keys — those are inlined into the web bundle.
 */

export function getServerGeminiKey() {
  return (process.env.GEMINI_KEY || process.env.GEMINI_API_KEY || "").trim();
}

export function getServerPineconeKey() {
  return (
    process.env.PINECONE_KEY ||
    process.env.PINECONE_API_KEY ||
    ""
  ).trim();
}

export function isServerGeminiConfigured() {
  return Boolean(getServerGeminiKey());
}

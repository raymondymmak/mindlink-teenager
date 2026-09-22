/**
 * Client-safe API gate helpers. This token is a *gate*, not a capability secret.
 * Never put GEMINI_KEY / PINECONE_KEY here or in EXPO_PUBLIC_*.
 */

export const MINDLINK_API_TOKEN_HEADER = "X-MindLink-Token";
export const DEFAULT_MINDLINK_API_TOKEN = "mindlink-demo-gate-v1";

export function getMindLinkApiToken() {
  return (
    process.env.EXPO_PUBLIC_MINDLINK_API_TOKEN ||
    DEFAULT_MINDLINK_API_TOKEN
  ).trim();
}

export function mindLinkApiHeaders(extra = {}) {
  const token = getMindLinkApiToken();
  const headers = {
    "Content-Type": "application/json",
    ...extra,
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
    headers[MINDLINK_API_TOKEN_HEADER] = token;
  }
  return headers;
}

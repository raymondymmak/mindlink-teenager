/**
 * CDN slot for the shared rate limit.
 * EAS Hosting workers cannot use caches.default. A public POST response
 * with Cache-Control is stored by the edge and shared across isolates.
 * This route does not call Gemini or Pinecone.
 */

export async function POST(request) {
  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const slot = Number(body?.slot);
  const windowId = Number(body?.windowId);
  const scope = String(body?.scope || "");
  const maxAge = Number(body?.maxAge);
  const scopeOk = /^[a-zA-Z0-9:_-]{1,80}$/.test(scope);
  if (
    !Number.isInteger(slot) ||
    slot < 0 ||
    slot > 500 ||
    !Number.isInteger(windowId) ||
    !scopeOk ||
    !Number.isInteger(maxAge) ||
    maxAge < 1 ||
    maxAge > 3600
  ) {
    return Response.json(
      { error: "Invalid rate-limit slot", code: "BAD_SLOT" },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }
  return Response.json(
    { ok: true, slot, windowId },
    {
      headers: {
        "Cache-Control": `public, max-age=${maxAge}`,
        "CDN-Cache-Control": `max-age=${maxAge}`,
      },
    }
  );
}

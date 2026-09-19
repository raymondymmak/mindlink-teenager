import { evaluateApiGuard, guardJsonResponse } from "../../server/apiGuard.js";
import {
  generateGeminiText,
  isServerGeminiConfigured,
  MAX_GEMINI_BODY_CHARS,
  resolveGeminiModel,
} from "../../server/geminiGenerate.js";

function json(body, status = 200) {
  return Response.json(body, { status });
}

function healthPayload() {
  const configured = isServerGeminiConfigured();
  return {
    configured,
    model: configured ? resolveGeminiModel("chat") : null,
  };
}

function deny(request) {
  const guard = evaluateApiGuard(request);
  if (!guard.ok) {
    return guardJsonResponse(guard);
  }
  return null;
}

export async function GET(request) {
  const blocked = deny(request);
  if (blocked) return blocked;
  return json(healthPayload());
}

export async function POST(request) {
  const blocked = deny(request);
  if (blocked) return blocked;

  let raw = "";
  try {
    raw = await request.text();
  } catch {
    return json({ error: "Invalid body", code: "INVALID_JSON" }, 400);
  }

  if (raw.length > MAX_GEMINI_BODY_CHARS) {
    return json(
      { error: "Request is too large", code: "PAYLOAD_TOO_LARGE" },
      413
    );
  }

  let body = {};
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return json({ error: "Invalid JSON", code: "INVALID_JSON" }, 400);
  }

  if (body?.apiKey || body?.key) {
    return json(
      { error: "Client API keys are not accepted", code: "KEY_NOT_ALLOWED" },
      400
    );
  }

  // EAS Hosting serves the SPA HTML for GET /api/*, so health is a POST.
  if (body?.health === true || body?.op === "health") {
    return json(healthPayload());
  }

  try {
    const text = await generateGeminiText({
      contents: body?.contents,
      systemInstruction: body?.systemInstruction,
      task: body?.task === "brief" ? "brief" : "chat",
      model: typeof body?.model === "string" ? body.model : undefined,
    });
    return json({ text });
  } catch (error) {
    const status = error?.status && error.status >= 400 ? error.status : 502;
    const code = error?.code || "GEMINI_FAILED";
    console.warn(`[api/gemini] failed ${code}`);
    return json(
      {
        error: error?.message || "gemini generation failed",
        code,
        configured: isServerGeminiConfigured(),
      },
      status
    );
  }
}

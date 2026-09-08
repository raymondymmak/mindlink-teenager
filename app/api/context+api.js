import { retrieveClinicalContext } from "../../server/retrieveContext";

function json(body, status = 200) {
  return Response.json(body, { status });
}

export async function GET() {
  return json(
    { error: "POST a JSON body with { query }", context: "", matches: [] },
    405
  );
}

export async function POST(request) {
  let body = {};
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON", context: "", matches: [] }, 400);
  }

  const query = typeof body?.query === "string" ? body.query : "";
  if (!query.trim()) {
    return json({ error: "query is required", context: "", matches: [] }, 400);
  }

  try {
    const result = await retrieveClinicalContext(query);
    console.log(
      `[api/context] ok matches=${result.matches.length} contextChars=${result.context.length}`
    );
    return json(result);
  } catch (error) {
    const status = error?.status && error.status >= 400 ? error.status : 502;
    console.warn(`[api/context] failed ${error?.code || "unknown"}`);
    return json(
      {
        error: "context retrieval failed",
        context: "",
        matches: [],
      },
      status
    );
  }
}

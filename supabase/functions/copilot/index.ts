// Supabase Edge Function: LLM proxy for the Akiles Travel copilot.
//
// Keeps the Gemini API key server-side. The browser NEVER sees it. The client
// runs the tool loop and sends {systemInstruction, contents, tools} here; we
// forward to Gemini and return its raw response.
//
// Deploy:  supabase functions deploy copilot
// Secret:  supabase secrets set GEMINI_API_KEY=xxxxx
//          (optional) supabase secrets set GEMINI_MODEL=gemini-2.5-flash
//
// verify_jwt stays ON (default) so only signed-in providers can call it.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST")
    return json({ error: "Method not allowed" }, 405);

  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) return json({ error: "GEMINI_API_KEY no está configurada." }, 500);
  const model = Deno.env.get("GEMINI_MODEL") ?? "gemini-2.5-flash";

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "JSON inválido." }, 400);
  }

  // Only forward the fields Gemini expects (don't trust arbitrary payloads).
  const payload = {
    systemInstruction: body.systemInstruction,
    contents: body.contents,
    tools: body.tools,
    toolConfig: body.toolConfig ?? {
      functionCallingConfig: { mode: "AUTO" },
    },
    generationConfig: body.generationConfig ?? { temperature: 0.4 },
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  return json(data, res.ok ? 200 : res.status);
});

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "content-type": "application/json" },
  });
}

import { RequestSchema } from "./schemas";
import { SessionStore } from "./persistence";
import { SupabaseToolsTransport } from "./transport";
import { SupabaseCatalog } from "./catalog";
import { GeminiModel } from "./model";
import { runConciergeTurn } from "./orchestrator";
import { response } from "./voice";
export type ServerConfig = { url: string; key: string; aiEnabled: boolean; debug: boolean };
export async function handleConcierge(request: Request, config: ServerConfig): Promise<Response> {
  const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
  if (request.method !== "POST") return json({ error: "Método no permitido." }, 405);
  if (!config.url || !config.key) return json({ error: "Concierge todavía no está configurado en el servidor." }, 503);
  if (!request.headers.get("content-type")?.includes("application/json")) return json({ error: "Se requiere JSON." }, 415);
  const started = Date.now();
  let conversationId: string | undefined;
  try {
    const text = await request.text();
    if (text.length > 5000) return json({ error: "Solicitud demasiado larga." }, 413);
    const parsed = RequestSchema.safeParse(JSON.parse(text));
    if (!parsed.success) return json({ error: "Solicitud inválida." }, 400);
    const input = parsed.data;
    const db = new SupabaseToolsTransport(config.url, config.key, request.headers.get("authorization") ?? undefined);
    const store = new SessionStore(db, input.token);
    const loaded = await store.load();
    conversationId = loaded.id;
    if (input.action === "load") return json({ conversationId, messages: loaded.messages });
    const requestId = input.requestId!; const message = input.message!;
    const claim = await store.claim(requestId);
    if (claim.cached) return json({ conversationId, response: claim.cached });
    const current = claim.session!;
    const toolCalls: string[] = []; const errors: string[] = [];
    const tools = new SupabaseCatalog(db, (tool) => toolCalls.push(tool));
    const model = new GeminiModel(db, config.aiEnabled, (error) => errors.push(error));
    let turn;
    try { turn = await runConciergeTurn(current.state, message, tools, model); }
    catch {
      errors.push("turn_failed");
      turn = { state: current.state, response: response("No pude verificar los datos necesarios. No voy a recomendar algo sin comprobarlo. Intenta de nuevo o pide ayuda al equipo.", true), trace: [] };
    }
    await store.save(requestId, current.version, turn.state, message, turn.response);
    if (config.debug) console.info(JSON.stringify({ event: "concierge_turn", conversationId, intent: turn.state.intent,
      stage: turn.state.stage, trace: turn.trace, toolCalls, errors, latencyMs: Date.now() - started, persistence: "saved" }));
    return json({ conversationId, response: turn.response });
  } catch {
    if (config.debug) console.error(JSON.stringify({ event: "concierge_request_failed", conversationId, latencyMs: Date.now() - started }));
    return json({ error: "No pude guardar o recuperar esta conversación. Reintenta en unos momentos; si continúa, consulta al equipo." }, 503);
  }
}

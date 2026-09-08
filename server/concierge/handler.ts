import { RequestSchema } from "./schemas";
import { z } from "zod";
import { createHmac } from "node:crypto";
import { SessionStore } from "./persistence";
import { SupabaseToolsTransport, ToolError } from "./transport";
import { SupabaseCatalog } from "./catalog";
import { GeminiModel } from "./model";
import { runConciergeTurn } from "./orchestrator";
import { response } from "./voice";
export type ServerConfig = { url: string; key: string; serviceKey: string; enabled: boolean; aiEnabled: boolean; debug: boolean; development: boolean; clientAddress: string };
export async function handleConcierge(request: Request, config: ServerConfig): Promise<Response> {
  const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
  if (request.method !== "POST") return json({ error: "Método no permitido." }, 405);
  if (!config.enabled) return json({ error: "Akiles Concierge está desactivado." }, 503);
  if (!config.url || !config.key || !config.serviceKey || config.key === config.serviceKey || !config.clientAddress) return json({ error: "Concierge todavía no está configurado en el servidor." }, 503);
  if (!request.headers.get("content-type")?.includes("application/json")) return json({ error: "Se requiere JSON." }, 415);
  const started = Date.now();
  let conversationId: string | undefined;
  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).length > 5000) return json({ error: "Solicitud demasiado larga." }, 413);
    let body: unknown;
    try { body = JSON.parse(text); } catch { return json({ error: "JSON inválido." }, 400); }
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) return json({ error: "Solicitud inválida." }, 400);
    const input = parsed.data;
    const deadline = started + 65000;
    // Catalog/model always use anon/RLS. Privileged key is confined to session RPCs.
    const db = new SupabaseToolsTransport(config.url, config.key, undefined, deadline);
    const persistenceDb = new SupabaseToolsTransport(config.url, config.serviceKey, undefined, deadline);
    const bucket = createHmac("sha256", config.serviceKey).update(config.clientAddress).digest("hex");
    await persistenceDb.rpc("concierge_gate_v2", { p_bucket: bucket }, false, 1);
    const authorization = request.headers.get("authorization");
    let userId: string | null = null;
    if (authorization) {
      if (!/^Bearer \S+$/.test(authorization)) return json({ error: "Sesión inválida." }, 401);
      const auth = await fetch(`${config.url}/auth/v1/user`, { headers: { apikey: config.key, Authorization: authorization }, signal: AbortSignal.timeout(5000) });
      if (!auth.ok) return json({ error: "Inicia sesión de nuevo." }, 401);
      userId = z.object({ id: z.string().uuid() }).parse(await auth.json()).id;
    }
    const store = new SessionStore(persistenceDb, input.token, userId);
    const loadStarted = performance.now();
    const loaded = await store.load();
    const sessionLoadMs = performance.now() - loadStarted;
    conversationId = loaded.id;
    if (input.action === "load") return json({ conversationId, messages: loaded.messages });
    const requestId = input.requestId!; const message = input.message!;
    const claimStarted = performance.now();
    const claim = await store.claim(requestId, message);
    const claimMs = performance.now() - claimStarted;
    if (claim.cached) return json({ conversationId, response: claim.cached });
    const current = claim.session!;
    const toolCalls: string[] = []; const errors: string[] = [];
    const tools = new SupabaseCatalog(db, (tool) => toolCalls.push(tool));
    // Gemini is reached only through the server-side, service-role-protected
    // gateway. Catalog reads remain on the public/RLS transport above.
    const model = new GeminiModel(persistenceDb, config.aiEnabled, (error) => errors.push(error));
    let turn;
    try { turn = await runConciergeTurn(current.state, message, tools, model); }
    catch {
      errors.push("turn_failed");
      turn = { state: { ...current.state, turnCount: Math.min(1000, current.state.turnCount + 1) }, response: response("No pude verificar los datos necesarios. Intenta de nuevo o pide ayuda al equipo.", true), trace: [], timings: {} };
    }
    // Separate save budget lets a timed-out turn persist its safe failure.
    const saveStore = new SessionStore(new SupabaseToolsTransport(config.url, config.serviceKey), input.token, userId);
    const saveStarted = performance.now();
    await saveStore.save(requestId, current.nonce, current.version, turn.state, message, turn.response);
    const timings = { sessionLoadMs, claimMs, ...turn.timings, saveStateMs: performance.now() - saveStarted };
    const summary = { conversationId, intent: turn.state.intent, stage: turn.state.stage, toolCalls, errors, timings, latencyMs: Date.now() - started };
    if (config.debug) console.info(JSON.stringify({ event: "concierge_turn", ...summary }));
    const debug = config.debug && config.development ? { ...summary, message, stateBefore: current.state,
      nodes: turn.trace, finalRecommendationIds: turn.response.recommendations.map((r) => r.id), stateAfter: turn.state, persistence: "saved" } : undefined;
    return json({ conversationId, response: turn.response, ...(debug ? { debug } : {}) });
  } catch (error) {
    if (config.debug) console.error(JSON.stringify({ event: "concierge_request_failed", conversationId, latencyMs: Date.now() - started }));
    const status = error instanceof ToolError && [403,409,429].includes(error.status) ? error.status : 503;
    return json({ error: status === 409 ? "Hay un turno en proceso o el reintento cambió. Espera unos momentos." : status === 429 ? "Has alcanzado el límite temporal. Espera un minuto." : "No pude guardar o recuperar esta conversación. Reintenta en unos momentos." }, status);
  }
}

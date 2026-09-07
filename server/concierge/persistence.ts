import { z } from "zod";
import { newState, StateSchema, ResponseSchema, type ConciergeState, type ConciergeResponse } from "../../src/concierge/contracts";
import { SupabaseToolsTransport } from "./transport";
const SessionSchema = z.object({ id: z.string().uuid(), userId: z.string().uuid().nullable(), state: z.unknown(), version: z.number().int() });
function session(raw: unknown) {
  const s = SessionSchema.parse(raw);
  const parsed = StateSchema.safeParse(s.state);
  const state = parsed.success ? parsed.data : newState(s.id, s.userId ?? undefined);
  // Database owns identity. Never accept a persisted/client-authored user override.
  state.conversationId = s.id; state.userId = s.userId ?? undefined;
  return { ...s, state };
}
export class SessionStore {
  constructor(private db: SupabaseToolsTransport, private token: string) {}
  async load() {
    const raw = await this.db.rpc("concierge_load", { p_token: this.token }, true);
    const messages = z.object({ messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string(), metadata: z.unknown() })) }).parse(raw).messages;
    return { ...session(raw), messages: messages.map((m) => ({ ...m, metadata: ResponseSchema.safeParse(m.metadata).success ? ResponseSchema.parse(m.metadata) : undefined })) };
  }
  async claim(requestId: string) {
    const raw = await this.db.rpc("concierge_claim", { p_token: this.token, p_request: requestId }, true);
    const cached = z.object({ cached: ResponseSchema }).safeParse(raw);
    return cached.success ? { cached: cached.data.cached } : { session: session(raw) };
  }
  async save(requestId: string, version: number, state: ConciergeState, message: string, result: ConciergeResponse) {
    await this.db.rpc("concierge_finish", { p_token: this.token, p_request: requestId, p_version: version,
      p_state: StateSchema.parse(state), p_message: message, p_response: ResponseSchema.parse(result) }, true);
  }
}

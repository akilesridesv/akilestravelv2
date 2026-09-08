import { z } from "zod";
import { createHash } from "node:crypto";
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
  constructor(private db: SupabaseToolsTransport, private token: string, private userId: string | null) {}
  private identity() { return { p_hash: createHash("sha256").update(this.token).digest("hex"), p_user: this.userId }; }
  async load() {
    const raw = await this.db.rpc("concierge_load_v2", this.identity());
    const messages = z.object({ messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string(), metadata: z.unknown() })) }).parse(raw).messages;
    return { ...session(raw), messages: messages.map((m) => ({ ...m, metadata: ResponseSchema.safeParse(m.metadata).success ? ResponseSchema.parse(m.metadata) : undefined })) };
  }
  async claim(requestId: string, message: string) {
    const raw = await this.db.rpc("concierge_claim_v2", { ...this.identity(), p_request: requestId, p_message_hash: createHash("sha256").update(message).digest("hex") }, false, 1);
    const cached = z.object({ cached: ResponseSchema }).safeParse(raw);
    return cached.success ? { cached: cached.data.cached } : { session: { ...session(raw), nonce: z.object({ nonce: z.string().uuid() }).parse(raw).nonce } };
  }
  async save(requestId: string, nonce: string, version: number, state: ConciergeState, message: string, result: ConciergeResponse) {
    await this.db.rpc("concierge_finish_v2", { ...this.identity(), p_request: requestId, p_nonce: nonce, p_version: version,
      p_message_hash: createHash("sha256").update(message).digest("hex"),
      p_state: StateSchema.parse(state), p_message: message, p_response: ResponseSchema.parse(result) });
  }
}

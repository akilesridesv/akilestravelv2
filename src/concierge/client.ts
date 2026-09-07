import { z } from "zod";
import { supabase } from "@/lib/supabase";
import { ResponseSchema } from "./contracts";
export const isConciergeEnabled = import.meta.env.VITE_CONCIERGE_ENABLED === "true";
const LoadSchema = z.object({ conversationId: z.string().uuid(), messages: z.array(z.object({
  role: z.enum(["user", "assistant"]), content: z.string(), metadata: ResponseSchema.optional(),
})) });
const TurnSchema = z.object({ conversationId: z.string().uuid(), response: ResponseSchema });
export async function conciergeRequest(action: "load" | "turn", scope: string, message?: string, requestId?: string) {
  const session = supabase ? (await supabase.auth.getSession()).data.session : null;
  if ((session?.user.id ?? "guest") !== scope) throw new Error("La sesión cambió. Vuelve a abrir el chat.");
  const key = `akiles:concierge:${scope}`;
  let token = localStorage.getItem(key);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) {
    token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, "0")).join("");
    localStorage.setItem(key, token);
  }
  const res = await fetch("/api/concierge", {
    method: "POST", headers: { "Content-Type": "application/json", ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}) },
    body: JSON.stringify({ action, token, message, requestId }), signal: AbortSignal.timeout(90000),
  });
  if (!res.ok) throw new Error("No pude recuperar o guardar la conversación. Puedes reintentar en unos momentos.");
  const body: unknown = await res.json();
  return action === "load" ? LoadSchema.parse(body) : TurnSchema.parse(body);
}
export function resetConcierge(scope: string) { localStorage.removeItem(`akiles:concierge:${scope}`); }

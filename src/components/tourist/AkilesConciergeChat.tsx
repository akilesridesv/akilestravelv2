import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Send, Sparkles } from "lucide-react";
import { useApp } from "@/state/store";
import { conciergeRequest, resetConcierge } from "@/concierge/client";
import type { ConciergeMessage } from "@/concierge/contracts";
import { ExperienceImage } from "@/components/provider/ExperienceImage";

export function AkilesConciergeChat({ initial }: { initial?: { id: string; text: string } }) {
  const scope = useApp((s) => s.user?.id ?? "guest");
  const authReady = useApp((s) => s.authReady);
  return authReady ? <Conversation key={scope} scope={scope} initial={initial} /> : <p role="status">Preparando tu conversación…</p>;
}
function Conversation({ scope, initial }: { scope: string; initial?: { id: string; text: string } }) {
  const [messages, setMessages] = useState<ConciergeMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const pending = useRef<{ text: string; id: string } | null>(null);
  const sentInitial = useRef<string>();
  const running = useRef(false);
  const alive = useRef(true);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    let active = true;
    setReady(false); setError("");
    conciergeRequest("load", scope).then((result) => {
      if (active && "messages" in result) { setMessages(result.messages); setReady(true); }
    }).catch((e: Error) => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [scope, revision]);
  const send = useCallback(async (text: string) => {
    if (!text.trim() || running.current || !ready) return;
    running.current = true; setBusy(true); setError(""); setInput("");
    const retry = pending.current?.text === text;
    if (!retry) { pending.current = { text, id: crypto.randomUUID() }; setMessages((m) => [...m, { role: "user", content: text }]); }
    try {
      const result = await conciergeRequest("turn", scope, text, pending.current!.id);
      if (alive.current && "response" in result) { setMessages((m) => [...m, { role: "assistant", content: result.response.text, metadata: result.response }]); pending.current = null; }
    } catch (e) { if (alive.current) setError(e instanceof Error ? e.message : "No pude completar el turno."); }
    finally { running.current = false; if (alive.current) setBusy(false); }
  }, [ready, scope]);
  useEffect(() => {
    if (initial && ready && !busy && sentInitial.current !== initial.id) { sentInitial.current = initial.id; void send(initial.text); }
  }, [initial, ready, busy, send]);
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [messages, busy]);
  return <div className="flex h-[64vh] max-h-[720px] flex-col rounded-2xl border border-border bg-card">
    <div className="flex items-center justify-between border-b border-border px-4 py-3">
      <span className="flex items-center gap-2 font-medium"><Sparkles className="h-4 w-4" /> Akiles Concierge</span>
      <button disabled={busy} className="text-xs underline" onClick={() => { resetConcierge(scope); pending.current = null; setMessages([]); setRevision((v) => v + 1); }}>Nueva conversación</button>
    </div>
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4" aria-live="polite">
      {!messages.length && ready && <p className="text-sm text-muted-foreground">Cuéntame qué te gustaría hacer y cómo quieres sentirte. Buscaré entre las experiencias de Akiles.</p>}
      {messages.map((m, i) => <div key={i} className={m.role === "user" ? "ml-auto max-w-[85%]" : "max-w-[95%]"}>
        <p className={`whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm ${m.role === "user" ? "bg-ink text-background" : "border border-border bg-background"}`}>{m.content}</p>
        {!!m.metadata?.recommendations.length && <div className="mt-2 flex gap-3 overflow-x-auto pb-2">
          {m.metadata.recommendations.map((e) => <div key={e.id} className="w-52 shrink-0 overflow-hidden rounded-xl border border-border">
            <ExperienceImage imageRef={e.image} alt={e.title} className="aspect-[4/3] w-full" />
            <div className="space-y-2 p-3"><p className="text-sm font-medium">{e.title}</p><p className="text-xs text-muted-foreground">{e.reason}</p>
              <p className="text-xs">{e.priceFrom ? "Desde " : ""}{e.price} {e.currency} · precio base por persona</p>
              <Link className="block text-sm font-medium underline" to={e.path}>Ver experiencia</Link>
              <button disabled={busy} className="text-xs underline" onClick={() => void send(`¿Está disponible ${e.title}?`)}>Ver disponibilidad</button>
            </div>
          </div>)}
        </div>}
        {m.metadata?.recommendations.length === 2 && <button disabled={busy} className="mt-2 text-sm underline" onClick={() => void send(`Compara ${m.metadata!.recommendations.map((e) => e.title).join(" y ")}`)}>Comparar</button>}
        {m.metadata?.bookingPath && <Link className="mt-2 inline-block rounded-full bg-primary px-4 py-2 text-sm font-semibold" to={m.metadata.bookingPath}>Continuar a reserva</Link>}
        {m.metadata?.handoff && <Link to="/cuenta" className="mt-2 block text-sm underline">Abrir mi cuenta para solicitar ayuda a Akiles</Link>}
      </div>)}
      {(busy || !ready && !error) && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> {busy ? "Revisando tus preferencias y el catálogo…" : "Recuperando la conversación…"}</p>}
      {error && <div role="alert" className="text-sm text-destructive">{error} <button className="underline" onClick={() => pending.current ? void send(pending.current.text) : setRevision((v) => v + 1)}>Reintentar</button></div>}
      <div ref={end} />
    </div>
    <form className="flex gap-2 border-t border-border p-3" onSubmit={(e) => { e.preventDefault(); void send(input); }}>
      <input aria-label="Mensaje para Akiles Concierge" maxLength={2000} value={input} onChange={(e) => setInput(e.target.value)} placeholder="Cuéntame qué plan tienes en mente…" className="h-11 min-w-0 flex-1 rounded-full border border-input bg-background px-4 text-sm" />
      <button aria-label="Enviar" disabled={busy || !ready || !input.trim()} className="rounded-full bg-primary p-3 disabled:opacity-50"><Send className="h-4 w-4" /></button>
    </form>
  </div>;
}

import { useEffect, useRef, useState } from "react";
import { runAdminTurn, type AdminChatTurn } from "@/ai/adminAgent";
import { Markdown } from "@/components/ui/Markdown";
import { notify } from "@/state/toast";
import { cn } from "@/lib/utils";
import { Sparkles, Send, Loader2 } from "lucide-react";

const SUGGESTIONS = [
  "¿Cómo va el negocio? Dame los KPIs",
  "¿Cuánto le debemos a cada proveedor?",
  "Verifica al proveedor Akiles Ride",
  "Muéstrame las solicitudes nuevas",
];

/** Central admin assistant: operate the platform by natural language. */
export function AdminChat({ onChanged }: { onChanged?: () => void }) {
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; text: string }[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, busy]);

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    setInput("");
    const history: AdminChatTurn[] = messages.map((m) => ({ role: m.role, text: m.text }));
    setMessages((m) => [...m, { role: "user", text: q }]);
    setBusy(true);
    try {
      const turn = await runAdminTurn(q, history);
      setMessages((m) => [...m, { role: "assistant", text: turn.text }]);
      if (turn.changed) onChanged?.();
    } catch {
      notify("El asistente no está disponible ahora.", "warning");
      setMessages((m) => [...m, { role: "assistant", text: "Ups, no pude procesar eso. ¿Lo intentamos de nuevo?" }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-[70vh] max-h-[680px] flex-col rounded-2xl border border-border bg-card">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {messages.length === 0 && !busy && (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15 text-ink">
              <Sparkles className="h-6 w-6" />
            </span>
            <div>
              <p className="font-display text-lg">Asistente de administración</p>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                Opera la plataforma por lenguaje natural: métricas, verificar proveedores, tarifas,
                publicar experiencias, reservas, solicitudes y facturación.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-full border border-border px-3 py-1.5 text-sm text-muted-foreground transition hover:bg-accent"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
            <div
              className={cn(
                "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
                m.role === "user" ? "bg-ink text-background" : "border border-border bg-background"
              )}
            >
              {m.role === "user" ? <p className="whitespace-pre-wrap break-words">{m.text}</p> : <Markdown text={m.text} />}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex justify-start">
            <div className="inline-flex items-center gap-2 rounded-2xl border border-border bg-background px-3.5 py-2.5 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-primary" /> Pensando…
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="flex items-center gap-2 border-t border-border p-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          placeholder="Dile qué hacer… (ej. 'baja la comisión de Akiles Ride a 8%')"
          className="h-11 flex-1 rounded-full border border-input bg-background px-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          onClick={() => send(input)}
          disabled={busy || !input.trim()}
          aria-label="Enviar"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-ink transition hover:opacity-90 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
